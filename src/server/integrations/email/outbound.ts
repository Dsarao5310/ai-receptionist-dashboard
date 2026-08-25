import "server-only";

import type { AuthContext } from "@/server/auth/policy";
import { recordAuditEvent } from "@/server/audit";
import { workspaceScope } from "@/server/db/workspace-scope";
import { commitWithSyncGuard } from "@/server/integrations/sync-guard";
import {
  runWorkflowOperation,
  type ExecutorResult,
  type OperationDisposition,
} from "@/server/integrations/n8n/operations";
import { normalizeEmailAddress } from "./addresses";
import { sendEmail } from "./client";
import { EMAIL_ERRORS } from "./errors";

export interface RequestOutboundEmailInput {
  to: string;
  subject: string;
  body: string;
  customerId?: string | null;
  conversationId?: string | null;
  replyToThreadId?: string | null;
  now: Date;
}

function executor(
  context: AuthContext,
  input: RequestOutboundEmailInput & {
    to: string;
    mailbox: { providerMailboxId: string; address: string };
  }
): (ctx: { operationId: string; now: Date }) => Promise<ExecutorResult> {
  return async ({ operationId, now }) => {
    const result = await sendEmail({
      from: input.mailbox.address,
      to: input.to,
      subject: input.subject,
      body: input.body,
      replyToThreadId: input.replyToThreadId,
      now,
    });
    if (!result.ok) return result;

    const scope = workspaceScope(context);
    const committed = await commitWithSyncGuard(
      context,
      {
        appointmentId: null,
        operationId,
        detail: "Email was accepted but its local record could not be saved.",
        now,
      },
      async () => {
        const applied = await scope.email.applyMessage({
          providerMailboxId: input.mailbox.providerMailboxId,
          providerThreadId: result.value.threadId,
          providerMessageId: result.value.messageId,
          direction: "outbound",
          fromAddress: input.mailbox.address,
          toAddress: input.to,
          subject: input.subject,
          body: input.body,
          eventAt: now,
          customerId: input.customerId,
          conversationId: input.conversationId,
        });
        if (!applied.ok) throw new Error("email local commit rejected");
        return applied.message;
      }
    );
    if (!committed.ok) {
      return { ok: false, error: EMAIL_ERRORS.localWriteFailed(now) };
    }

    await recordAuditEvent({
      actorUserId: context.user.id,
      workspaceId: context.workspaceId,
      action: "workflow.operation_invoked",
      targetType: "email_message",
      targetId: committed.value.id,
      metadata: { direction: "outbound", status: committed.value.status },
    });
    return { ok: true, reference: result.value.messageId };
  };
}

export async function requestOutboundEmail(
  context: AuthContext,
  input: RequestOutboundEmailInput
): Promise<OperationDisposition> {
  const to = normalizeEmailAddress(input.to);
  if (!to) {
    return { kind: "failed", operation: null, error: EMAIL_ERRORS.invalidAddress(input.now) };
  }
  const subject = input.subject.trim().slice(0, 998);
  const body = input.body.trim();
  if (!body || body.length > 100_000) {
    return { kind: "failed", operation: null, error: EMAIL_ERRORS.rejected(input.now) };
  }

  const mailboxes = await workspaceScope(context).email.listMailboxes();
  const mailbox = mailboxes.find((entry) => entry.active && entry.outboundEnabled);
  if (!mailbox) {
    return { kind: "failed", operation: null, error: EMAIL_ERRORS.notConfigured(input.now) };
  }

  return runWorkflowOperation(context, {
    operation: "customer.message",
    idempotencyParts: [mailbox.id, to, subject, body, input.replyToThreadId ?? "new-thread"],
    target: input.customerId ? { type: "customer", id: input.customerId } : undefined,
    now: input.now,
    data: { to, channel: "email" },
    executor: executor(context, { ...input, to, subject, body, mailbox }),
  });
}
