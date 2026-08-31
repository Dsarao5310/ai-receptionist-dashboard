import "server-only";

import { newId } from "../ids";
import { iso, nullableStr, str, WorkspaceScopedRepository, type Row } from "./base";

/**
 * SMS, and the numbers that identify a tenant.
 *
 * ── Two tables, two very different trust levels ─────────────────────────────
 * `provider_phone_numbers` is a mapping the platform issues, and it is what
 * makes an inbound message attributable at all. `sms_messages` is a record of
 * traffic. The first is consulted *before* a workspace is known and is
 * therefore the one place here that is not workspace-scoped; everything else on
 * this class is.
 */

export interface ProviderPhoneNumber {
  id: string;
  workspaceId: string;
  provider: "twilio" | "vapi";
  phoneNumber: string;
  providerSid: string | null;
  label: string;
  smsEnabled: boolean;
  voiceEnabled: boolean;
}

export type SmsDirection = "inbound" | "outbound";
export type SmsStatus = "queued" | "sent" | "delivered" | "undelivered" | "failed" | "received";

export interface SmsMessage {
  id: string;
  workspaceId: string;
  direction: SmsDirection;
  providerMessageSid: string | null;
  fromNumber: string;
  toNumber: string;
  body: string;
  status: SmsStatus;
  errorCode: string | null;
  errorMessage: string | null;
  conversationId: string | null;
  customerId: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
}

function toNumberRow(row: Row): ProviderPhoneNumber {
  return {
    id: str(row.id),
    workspaceId: str(row.workspace_id),
    provider: str(row.provider) as ProviderPhoneNumber["provider"],
    phoneNumber: str(row.phone_number),
    providerSid: nullableStr(row.provider_sid),
    label: str(row.label),
    smsEnabled: row.sms_enabled === true,
    voiceEnabled: row.voice_enabled === true,
  };
}

function toMessage(row: Row): SmsMessage {
  return {
    id: str(row.id),
    workspaceId: str(row.workspace_id),
    direction: str(row.direction) as SmsDirection,
    providerMessageSid: nullableStr(row.provider_message_sid),
    fromNumber: str(row.from_number),
    toNumber: str(row.to_number),
    body: str(row.body),
    status: str(row.status) as SmsStatus,
    errorCode: nullableStr(row.error_code),
    errorMessage: nullableStr(row.error_message),
    conversationId: nullableStr(row.conversation_id),
    customerId: nullableStr(row.customer_id),
    sentAt: row.sent_at ? iso(row.sent_at) : null,
    deliveredAt: row.delivered_at ? iso(row.delivered_at) : null,
    createdAt: iso(row.created_at),
  };
}

/** Twilio never transitions a delivery status further once it lands here. */
const TERMINAL_SMS_STATUSES = new Set<SmsStatus>(["delivered", "undelivered", "failed"]);

export class MessagingRepository extends WorkspaceScopedRepository {
  // ── Numbers ───────────────────────────────────────────────────────────────

  async listNumbers(): Promise<ProviderPhoneNumber[]> {
    const rows = await this.sql`
      select * from provider_phone_numbers
      where workspace_id = ${this.ws} order by phone_number`;
    return rows.map(toNumberRow);
  }

  /**
   * Claim a number for this workspace.
   *
   * The unique constraint on `phone_number` is global, so an attempt to claim a
   * number another tenant already holds fails at the database rather than
   * silently repointing it. That is deliberate: repointing would move every
   * future inbound message for that number to a different business.
   */
  async claimNumber(input: {
    provider: "twilio" | "vapi";
    phoneNumber: string;
    providerSid?: string | null;
    label?: string;
    smsEnabled?: boolean;
    voiceEnabled?: boolean;
  }): Promise<ProviderPhoneNumber> {
    const id = newId("pnum");
    const [row] = await this.sql`
      insert into provider_phone_numbers
        (id, workspace_id, provider, phone_number, provider_sid, label, sms_enabled, voice_enabled)
      values (
        ${id}, ${this.ws}, ${input.provider}, ${input.phoneNumber},
        ${input.providerSid ?? null}, ${input.label ?? ""},
        ${input.smsEnabled ?? true}, ${input.voiceEnabled ?? false}
      )
      returning *`;
    return toNumberRow(row);
  }

  async releaseNumber(phoneNumber: string): Promise<void> {
    await this.sql`
      delete from provider_phone_numbers
      where workspace_id = ${this.ws} and phone_number = ${phoneNumber}`;
  }

  // ── Messages ──────────────────────────────────────────────────────────────

  async recordMessage(input: {
    direction: SmsDirection;
    providerMessageSid: string | null;
    fromNumber: string;
    toNumber: string;
    body: string;
    status: SmsStatus;
    conversationId?: string | null;
    customerId?: string | null;
    sentAt?: Date | null;
  }): Promise<SmsMessage> {
    const id = newId("sms");
    const [row] = await this.sql`
      insert into sms_messages
        (id, workspace_id, provider, direction, provider_message_sid, from_number, to_number,
         body, status, conversation_id, customer_id, sent_at)
      values (
        ${id}, ${this.ws}, 'twilio', ${input.direction}, ${input.providerMessageSid ?? null},
        ${input.fromNumber}, ${input.toNumber}, ${input.body}, ${input.status},
        ${input.conversationId ?? null}, ${input.customerId ?? null}, ${input.sentAt ?? null}
      )
      returning *`;
    return toMessage(row);
  }

  async findByProviderSid(providerMessageSid: string): Promise<SmsMessage | null> {
    const [row] = await this.sql`
      select * from sms_messages
      where workspace_id = ${this.ws} and provider_message_sid = ${providerMessageSid}`;
    return row ? toMessage(row) : null;
  }

  async attachProviderSid(id: string, providerMessageSid: string, sentAt: Date): Promise<void> {
    await this.sql`
      update sms_messages
      set provider_message_sid = ${providerMessageSid}, status = 'sent', sent_at = ${sentAt}
      where id = ${id} and workspace_id = ${this.ws}`;
  }

  /**
   * Apply a delivery outcome that arrived after the send.
   *
   * This is the whole reason the table exists. A carrier accepting a message is
   * not the message arriving, and the difference shows up here — minutes later,
   * on a separate request, against a row that already said `sent`.
   *
   * ── Terminal means terminal ──────────────────────────────────────────────
   * Twilio's status callbacks carry no event timestamp to order by (unlike
   * Vapi's or call-privacy's provider events), only a status string, and
   * delivery is not guaranteed in order — a retried `sent` callback can
   * legitimately arrive after the `delivered` one it preceded. But Twilio also
   * never transitions a message once it reaches `delivered`, `undelivered` or
   * `failed`: those are sinks, not states it revisits. So a callback that
   * shows up after one already landed is necessarily stale, and the guard
   * needed is simpler than a timestamp comparison — refuse any further write
   * once the row is already terminal, mirroring the terminal-state guard
   * `VapiCallRepository.applyCallUpdate` already uses for the same reason.
   */
  async applyDeliveryStatus(input: {
    providerMessageSid: string;
    status: SmsStatus;
    errorCode?: string | null;
    errorMessage?: string | null;
    at: Date;
  }): Promise<{ message: SmsMessage; changed: boolean } | null> {
    const [existing] = await this.sql`
      select * from sms_messages
      where workspace_id = ${this.ws} and provider_message_sid = ${input.providerMessageSid}`;
    if (!existing) return null;

    if (TERMINAL_SMS_STATUSES.has(str(existing.status) as SmsStatus)) {
      return { message: toMessage(existing), changed: false };
    }

    const [row] = await this.sql`
      update sms_messages set
        status        = ${input.status},
        error_code    = ${input.errorCode ?? null},
        error_message = ${input.errorMessage ?? null},
        delivered_at  = ${input.status === "delivered" ? input.at : null}
      where workspace_id = ${this.ws} and provider_message_sid = ${input.providerMessageSid}
      returning *`;
    return row ? { message: toMessage(row), changed: true } : null;
  }

  async listMessages(limit = 50): Promise<SmsMessage[]> {
    const rows = await this.sql`
      select * from sms_messages
      where workspace_id = ${this.ws} order by created_at desc limit ${limit}`;
    return rows.map(toMessage);
  }

  /** Messages a carrier finally refused. The operator's queue. */
  async listUndelivered(limit = 50): Promise<SmsMessage[]> {
    const rows = await this.sql`
      select * from sms_messages
      where workspace_id = ${this.ws} and status in ('failed','undelivered')
      order by created_at desc limit ${limit}`;
    return rows.map(toMessage);
  }
}
