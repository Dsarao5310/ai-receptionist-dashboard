import "server-only";

import { newId } from "../ids";
import { iso, nullableStr, str, WorkspaceScopedRepository, type Row } from "./base";

export type VapiDomainCallStatus = "in_progress" | "completed" | "missed" | "failed";

export interface VapiTranscriptLine {
  speaker: "ai" | "customer";
  body: string;
  offsetLabel: string;
}

export interface VapiCallUpdate {
  providerCallId: string;
  providerStatus: string;
  domainStatus: VapiDomainCallStatus;
  eventAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  endedReason: string | null;
  customerPhone: string | null;
  summary: string | null;
  transcript?: VapiTranscriptLine[];
}

export interface VapiCallApplyResult {
  callId: string;
  conversationId: string;
  customerId: string | null;
  changed: boolean;
  becameTerminal: boolean;
  status: VapiDomainCallStatus;
}

const TERMINAL = new Set<VapiDomainCallStatus>(["completed", "missed", "failed"]);

/**
 * Vapi-owned state inside an already-authorized workspace.
 *
 * Global assistant/phone lookup lives in the narrow tenancy resolver. Once it
 * has established a workspace, every read and mutation below is scoped again
 * so a provider call id from another tenant cannot be attached or updated.
 */
export class VapiCallRepository extends WorkspaceScopedRepository {
  async listResourceCounts(): Promise<{ assistants: number; phoneNumbers: number }> {
    const [row] = await this.sql`
      select
        (select count(*) from vapi_assistants
          where workspace_id = ${this.ws} and active = true) as assistants,
        (select count(*) from provider_phone_numbers
          where workspace_id = ${this.ws} and provider = 'vapi' and voice_enabled = true) as phone_numbers`;
    return {
      assistants: Number(row?.assistants ?? 0),
      phoneNumbers: Number(row?.phone_numbers ?? 0),
    };
  }

  async claimAssistant(input: { assistantId: string; label?: string }): Promise<string> {
    const id = newId("vasst");
    await this.sql`
      insert into vapi_assistants (id, workspace_id, assistant_id, label)
      values (${id}, ${this.ws}, ${input.assistantId}, ${input.label ?? ""})`;
    return id;
  }

  async applyCallUpdate(input: VapiCallUpdate): Promise<VapiCallApplyResult> {
    const [existing] = await this.sql`
      select id, conversation_id, customer_id, status, started_at,
             provider_updated_at
      from calls
      where workspace_id = ${this.ws}
        and provider = 'vapi'
        and provider_call_id = ${input.providerCallId}`;

    const previousStatus = existing ? (str(existing.status) as VapiDomainCallStatus) : null;
    const previousAt = existing?.provider_updated_at
      ? new Date(iso(existing.provider_updated_at))
      : null;

    if (previousAt && input.eventAt.getTime() < previousAt.getTime()) {
      return existingResult(existing, previousStatus!, false, false);
    }

    if (previousStatus && TERMINAL.has(previousStatus) && input.domainStatus === "in_progress") {
      return existingResult(existing, previousStatus, false, false);
    }

    const [customer] = input.customerPhone
      ? await this.sql`
          select id from customers
          where workspace_id = ${this.ws}
            and archived_at is null
            and phone = ${input.customerPhone}
          order by created_at asc
          limit 1`
      : [];

    const customerId = customer
      ? str(customer.id)
      : existing
        ? nullableStr(existing.customer_id)
        : null;
    const startedAt = input.startedAt ?? (existing ? new Date(iso(existing.started_at)) : input.eventAt);
    const terminal = TERMINAL.has(input.domainStatus);
    const endedAt = input.endedAt ?? (terminal ? input.eventAt : null);
    const durationSec = endedAt
      ? Math.max(0, Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000))
      : 0;
    const outcome = input.domainStatus === "completed"
      ? "answered"
      : input.domainStatus === "missed"
        ? "missed"
        : "no_action";
    const summary = input.summary?.trim() || null;
    const preview = input.transcript?.map((line) => line.body).join(" ").slice(0, 240) || null;

    let callId: string;
    let conversationId: string;

    if (!existing) {
      callId = newId("call");
      conversationId = newId("conv");

      await this.sql`
        insert into conversations
          (id, workspace_id, customer_id, channel, intent, outcome, started_at,
           ended_at, summary, transcript_preview, provider, provider_ref)
        values
          (${conversationId}, ${this.ws}, ${customerId}, 'voice', 'other', ${outcome},
           ${startedAt}, ${endedAt}, ${summary ?? ""}, ${preview ?? ""},
           'vapi', ${input.providerCallId})`;

      await this.sql`
        insert into calls
          (id, workspace_id, conversation_id, customer_id, provider,
           provider_call_id, started_at, ended_at, duration_sec, status,
           provider_status, provider_updated_at, ended_reason)
        values
          (${callId}, ${this.ws}, ${conversationId}, ${customerId}, 'vapi',
           ${input.providerCallId}, ${startedAt}, ${endedAt}, ${durationSec},
           ${input.domainStatus}, ${input.providerStatus}, ${input.eventAt},
           ${input.endedReason})`;
    } else {
      callId = str(existing.id);
      conversationId = str(existing.conversation_id);

      await this.sql`
        update conversations set
          customer_id = coalesce(${customerId}, customer_id),
          started_at = least(started_at, ${startedAt}),
          ended_at = case when ${endedAt}::timestamptz is null then ended_at else ${endedAt} end,
          outcome = ${outcome},
          summary = coalesce(${summary}, nullif(summary, ''), ''),
          transcript_preview = coalesce(${preview}, nullif(transcript_preview, ''), '')
        where id = ${conversationId} and workspace_id = ${this.ws}`;

      await this.sql`
        update calls set
          customer_id = coalesce(${customerId}, customer_id),
          started_at = least(started_at, ${startedAt}),
          ended_at = case when ${endedAt}::timestamptz is null then ended_at else ${endedAt} end,
          duration_sec = greatest(duration_sec, ${durationSec}),
          status = ${input.domainStatus},
          provider_status = ${input.providerStatus},
          provider_updated_at = ${input.eventAt},
          ended_reason = coalesce(${input.endedReason}, ended_reason)
        where id = ${callId} and workspace_id = ${this.ws}`;
    }

    if (input.transcript) {
      await this.sql`
        delete from conversation_messages
        where conversation_id = ${conversationId}`;
      for (const [position, line] of input.transcript.entries()) {
        await this.sql`
          insert into conversation_messages
            (conversation_id, position, speaker, body, offset_label)
          values
            (${conversationId}, ${position}, ${line.speaker}, ${line.body}, ${line.offsetLabel})`;
      }
    }

    return {
      callId,
      conversationId,
      customerId,
      changed: true,
      becameTerminal: terminal && (!previousStatus || !TERMINAL.has(previousStatus)),
      status: input.domainStatus,
    };
  }
}

function existingResult(
  row: Row,
  status: VapiDomainCallStatus,
  changed: boolean,
  becameTerminal: boolean
): VapiCallApplyResult {
  return {
    callId: str(row.id),
    conversationId: str(row.conversation_id),
    customerId: nullableStr(row.customer_id),
    changed,
    becameTerminal,
    status,
  };
}
