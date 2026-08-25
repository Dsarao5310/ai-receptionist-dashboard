import "server-only";

import { newId } from "../ids";
import { getDb, type Sql } from "../client";
import { iso, nullableStr, str, WorkspaceScopedRepository, type Row } from "./base";

export interface EmailMailbox {
  id: string;
  workspaceId: string;
  providerMailboxId: string;
  address: string;
  label: string;
  inboundEnabled: boolean;
  outboundEnabled: boolean;
  active: boolean;
}

export interface EmailMessage {
  id: string;
  workspaceId: string;
  mailboxId: string;
  threadId: string;
  providerMessageId: string;
  direction: "inbound" | "outbound";
  status: "received" | "accepted" | "failed";
  fromAddress: string;
  toAddress: string;
  subject: string;
  body: string;
  customerId: string | null;
  conversationId: string | null;
  providerEventAt: string;
}

export interface ApplyEmailMessageInput {
  providerMailboxId: string;
  providerThreadId: string;
  providerMessageId: string;
  direction: "inbound" | "outbound";
  fromAddress: string;
  toAddress: string;
  subject: string;
  body: string;
  eventAt: Date;
  customerId?: string | null;
  conversationId?: string | null;
}

export type ApplyEmailMessageResult =
  | { ok: true; message: EmailMessage; createdThread: boolean }
  | { ok: false; reason: "mailbox_unavailable" | "mailbox_address_mismatch" };

function mailboxRow(row: Row): EmailMailbox {
  return {
    id: str(row.id),
    workspaceId: str(row.workspace_id),
    providerMailboxId: str(row.provider_mailbox_id),
    address: str(row.mailbox_address),
    label: str(row.label),
    inboundEnabled: row.inbound_enabled === true,
    outboundEnabled: row.outbound_enabled === true,
    active: row.active === true,
  };
}

function messageRow(row: Row): EmailMessage {
  return {
    id: str(row.id),
    workspaceId: str(row.workspace_id),
    mailboxId: str(row.mailbox_id),
    threadId: str(row.thread_id),
    providerMessageId: str(row.provider_message_id),
    direction: str(row.direction) as EmailMessage["direction"],
    status: str(row.status) as EmailMessage["status"],
    fromAddress: str(row.from_address),
    toAddress: str(row.to_address),
    subject: str(row.subject),
    body: str(row.body),
    customerId: nullableStr(row.customer_id),
    conversationId: nullableStr(row.conversation_id),
    providerEventAt: iso(row.provider_event_at),
  };
}

export async function resolveWorkspaceFromMailbox(
  providerMailboxId: string,
  sql: Sql = getDb()
): Promise<{ workspaceId: string; mailboxId: string; address: string } | null> {
  const [row] = await sql`
    select workspace_id, id, mailbox_address
    from email_mailboxes
    where provider = 'gmail'
      and provider_mailbox_id = ${providerMailboxId}
      and active = true
      and inbound_enabled = true`;
  return row
    ? {
        workspaceId: str(row.workspace_id),
        mailboxId: str(row.id),
        address: str(row.mailbox_address),
      }
    : null;
}

export class EmailRepository extends WorkspaceScopedRepository {
  async claimMailbox(input: {
    providerMailboxId: string;
    address: string;
    label?: string;
    inboundEnabled?: boolean;
    outboundEnabled?: boolean;
  }): Promise<EmailMailbox> {
    const id = newId("mbx");
    const [row] = await this.sql`
      insert into email_mailboxes
        (id, workspace_id, provider_mailbox_id, mailbox_address, label,
         inbound_enabled, outbound_enabled)
      values
        (${id}, ${this.ws}, ${input.providerMailboxId}, ${input.address},
         ${input.label ?? ""}, ${input.inboundEnabled ?? true},
         ${input.outboundEnabled ?? true})
      returning *`;
    return mailboxRow(row);
  }

  async listMailboxes(): Promise<EmailMailbox[]> {
    const rows = await this.sql`
      select * from email_mailboxes
      where workspace_id = ${this.ws}
      order by mailbox_address`;
    return rows.map(mailboxRow);
  }

  async listMessages(limit = 50): Promise<EmailMessage[]> {
    const rows = await this.sql`
      select * from email_messages
      where workspace_id = ${this.ws}
      order by provider_event_at desc
      limit ${limit}`;
    return rows.map(messageRow);
  }

  async applyMessage(input: ApplyEmailMessageInput): Promise<ApplyEmailMessageResult> {
    const [mailbox] = await this.sql`
      select * from email_mailboxes
      where workspace_id = ${this.ws}
        and provider = 'gmail'
        and provider_mailbox_id = ${input.providerMailboxId}
        and active = true
        and (${input.direction} = 'inbound' and inbound_enabled = true
          or ${input.direction} = 'outbound' and outbound_enabled = true)`;
    if (!mailbox) return { ok: false, reason: "mailbox_unavailable" };

    const mapped = mailboxRow(mailbox);
    const expectedAddress = input.direction === "inbound" ? input.toAddress : input.fromAddress;
    if (mapped.address !== expectedAddress) {
      return { ok: false, reason: "mailbox_address_mismatch" };
    }

    const [knownCustomer] = input.customerId
      ? await this.sql`
          select id from customers
          where workspace_id = ${this.ws} and id = ${input.customerId}`
      : await this.sql`
          select id from customers
          where workspace_id = ${this.ws}
            and archived_at is null
            and lower(email) = ${input.direction === "inbound" ? input.fromAddress : input.toAddress}
          order by created_at asc
          limit 1`;
    const customerId = knownCustomer ? str(knownCustomer.id) : null;

    let [thread] = await this.sql`
      select * from email_threads
      where workspace_id = ${this.ws}
        and mailbox_id = ${mapped.id}
        and provider_thread_id = ${input.providerThreadId}
      for update`;
    let conversationId = thread
      ? nullableStr(thread.conversation_id)
      : input.conversationId ?? null;
    const createdThread = !thread;

    if (!thread) {
      conversationId = conversationId ?? newId("conv");
      if (!input.conversationId) {
        await this.sql`
          insert into conversations
            (id, workspace_id, customer_id, channel, intent, outcome, started_at,
             summary, transcript_preview, provider, provider_ref)
          values
            (${conversationId}, ${this.ws}, ${customerId}, 'email', 'other',
             'answered', ${input.eventAt}, ${input.subject},
             ${input.body.slice(0, 240)}, 'gmail', ${input.providerThreadId})`;
      }

      const threadId = newId("ethr");
      [thread] = await this.sql`
        insert into email_threads
          (id, workspace_id, mailbox_id, provider_thread_id, customer_id,
           conversation_id, subject, last_message_at)
        values
          (${threadId}, ${this.ws}, ${mapped.id}, ${input.providerThreadId},
           ${customerId}, ${conversationId}, ${input.subject}, ${input.eventAt})
        returning *`;
    } else {
      conversationId = conversationId ?? newId("conv");
      if (!thread.conversation_id) {
        await this.sql`
          insert into conversations
            (id, workspace_id, customer_id, channel, intent, outcome, started_at,
             summary, transcript_preview, provider, provider_ref)
          values
            (${conversationId}, ${this.ws}, ${customerId}, 'email', 'other',
             'answered', ${input.eventAt}, ${input.subject},
             ${input.body.slice(0, 240)}, 'gmail', ${input.providerThreadId})`;
      }
      await this.sql`
        update email_threads set
          customer_id = coalesce(customer_id, ${customerId}),
          conversation_id = coalesce(conversation_id, ${conversationId}),
          subject = case when ${input.subject} = '' then subject else ${input.subject} end,
          last_message_at = greatest(last_message_at, ${input.eventAt})
        where workspace_id = ${this.ws} and id = ${str(thread.id)}`;
    }

    const [position] = await this.sql<{ nextPosition: number }[]>`
      select coalesce(max(position), -1) + 1 as "nextPosition"
      from conversation_messages
      where conversation_id = ${conversationId}`;
    await this.sql`
      insert into conversation_messages
        (conversation_id, position, speaker, body, offset_label)
      values
        (${conversationId}, ${Number(position?.nextPosition ?? 0)},
         ${input.direction === "inbound" ? "customer" : "ai"}, ${input.body}, '')`;
    await this.sql`
      update conversations set
        customer_id = coalesce(customer_id, ${customerId}),
        summary = case when ${input.subject} = '' then summary else ${input.subject} end,
        transcript_preview = ${input.body.slice(0, 240)},
        ended_at = greatest(coalesce(ended_at, ${input.eventAt}), ${input.eventAt})
      where workspace_id = ${this.ws} and id = ${conversationId}`;

    const id = newId("eml");
    const [message] = await this.sql`
      insert into email_messages
        (id, workspace_id, mailbox_id, thread_id, provider_message_id,
         direction, status, from_address, to_address, subject, body,
         customer_id, conversation_id, provider_event_at)
      values
        (${id}, ${this.ws}, ${mapped.id}, ${str(thread.id)},
         ${input.providerMessageId}, ${input.direction},
         ${input.direction === "inbound" ? "received" : "accepted"},
         ${input.fromAddress}, ${input.toAddress}, ${input.subject}, ${input.body},
         ${customerId}, ${conversationId}, ${input.eventAt})
      returning *`;

    return { ok: true, message: messageRow(message), createdThread };
  }
}
