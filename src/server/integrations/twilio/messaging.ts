import "server-only";

import type { NormalizedError } from "@/types";
import type { AuthContext } from "@/server/auth/policy";
import { recordAuditEvent } from "@/server/audit";
import { workspaceScope } from "@/server/db/workspace-scope";
import { serverEnv } from "@/server/env";
import { commitWithSyncGuard } from "@/server/integrations/sync-guard";
import {
  LOCAL_WRITE_FAILED_AFTER_EXTERNAL_SUCCESS,
  runWorkflowOperation,
  type ExecutorResult,
  type OperationDisposition,
} from "@/server/integrations/n8n/operations";
import { sendSms } from "./client";
import { TWILIO_ERRORS } from "./errors";
import { toE164 } from "./phone-numbers";

/**
 * Sending a text message, through the same spine as everything else.
 *
 * ── Why this looks like the calendar ────────────────────────────────────────
 * It is the same shape deliberately. An outbound SMS is an operation with an
 * external side effect, so it gets an operation row, an idempotency key, the
 * shared state machine and the same partial-failure guard. A caller asks for
 * "send this message"; whether a mapped n8n workflow performs it or this
 * adapter does is a deployment question the spine already answers.
 *
 * ── The two failure shapes, kept apart ──────────────────────────────────────
 *   • The carrier refuses      → the operation failed. Nothing was sent.
 *   • The carrier accepts and
 *     our own write fails      → `sync_required`. A real message is on its way
 *                                and a retry would send a second one.
 *
 * The second is the executor-owned write case that Google Calendar proved: the
 * mapping write belongs to the external half of the operation, so it is guarded
 * here rather than left to the caller.
 */

export interface SendMessageInput {
  /** The customer's number. Normalized before use. */
  to: string;
  body: string;
  customerId?: string | null;
  conversationId?: string | null;
  now: Date;
}

/** The number this workspace sends from, and whether it may. */
async function sendingNumber(context: AuthContext): Promise<string | null> {
  const numbers = await workspaceScope(context).messaging.listNumbers();
  const usable = numbers.find((n) => n.provider === "twilio" && n.smsEnabled);
  // Falls back to the configured single-number deployment, which is what a
  // trial account looks like before any mapping has been claimed.
  return usable?.phoneNumber ?? serverEnv.twilioPhoneNumber ?? null;
}

function localWriteFailed(now: Date): { ok: false; error: NormalizedError } {
  return {
    ok: false,
    error: {
      code: LOCAL_WRITE_FAILED_AFTER_EXTERNAL_SUCCESS,
      category: "unknown",
      severity: "critical",
      message: "That message was sent but could not be saved. Support has been notified.",
      provider: "twilio",
      timestamp: now.toISOString(),
      retryable: false,
    },
  };
}

/**
 * The executor: hand the message over, then record it.
 *
 * The record is written *after* the carrier accepts, because only then is there
 * a provider id to write. That ordering is what creates the dangerous window,
 * and why the write is wrapped.
 */
function sendExecutor(
  context: AuthContext,
  input: SendMessageInput & { from: string }
): (ctx: { operationId: string; now: Date }) => Promise<ExecutorResult> {
  return async ({ operationId, now }) => {
    const scope = workspaceScope(context);

    const result = await sendSms({
      to: input.to,
      from: input.from,
      body: input.body,
      statusCallbackUrl: serverEnv.twilioStatusCallbackUrl ?? null,
      now,
    });

    if (!result.ok) return { ok: false, error: result.error };

    const committed = await commitWithSyncGuard(
      context,
      {
        // No appointment: an SMS is not about one, so the operation row carries
        // the whole story rather than a flag being written somewhere it does
        // not belong.
        appointmentId: null,
        operationId,
        detail: `Message sent to ${input.to}, but it could not be saved.`,
        now,
      },
      () =>
        scope.messaging.recordMessage({
          direction: "outbound",
          providerMessageSid: result.value.sid,
          fromNumber: input.from,
          toNumber: input.to,
          body: input.body,
          // What Twilio actually said. Not "delivered" — that is a later fact.
          status: result.value.status === "sent" ? "sent" : "queued",
          customerId: input.customerId ?? null,
          conversationId: input.conversationId ?? null,
          sentAt: now,
        })
    );

    if (!committed.ok) return localWriteFailed(now);

    await recordAuditEvent({
      actorUserId: context.user.id,
      workspaceId: context.workspaceId,
      action: "workflow.operation_invoked",
      targetType: "sms_message",
      targetId: committed.value.id,
      // Numbers and ids only. Never the message body: it is customer content
      // and an audit row is not where customer content belongs.
      metadata: { to: input.to, status: committed.value.status },
    });

    return { ok: true, reference: result.value.sid };
  };
}

/**
 * Send a message to a customer.
 *
 * The idempotency key includes the destination and the body, so the same
 * message sent twice by a double-clicked button is one message, while a genuine
 * second message to the same person is a different operation.
 */
export async function requestOutboundMessage(
  context: AuthContext,
  input: SendMessageInput
): Promise<OperationDisposition> {
  const to = toE164(input.to);
  if (!to) {
    return {
      kind: "failed",
      operation: null,
      error: TWILIO_ERRORS.invalidRecipient(input.now),
    };
  }

  const from = await sendingNumber(context);
  if (!from) {
    return {
      kind: "failed",
      operation: null,
      error: TWILIO_ERRORS.notConfigured(input.now),
    };
  }

  return runWorkflowOperation(context, {
    operation: "customer.message",
    idempotencyParts: [to, input.body],
    target: input.customerId ? { type: "customer", id: input.customerId } : undefined,
    now: input.now,
    data: { to, channel: "sms" },
    executor: sendExecutor(context, { ...input, to, from }),
  });
}
