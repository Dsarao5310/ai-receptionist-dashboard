import "server-only";

import type { ActionStep, Conversation } from "@/types";
import { iso, num, str, WorkspaceScopedRepository, type Row } from "./base";

/**
 * Conversations, and the calls that carry the telephony facts about the voice
 * ones.
 *
 * A conversation stands on its own. Most never produce an appointment, and the
 * model does not pretend otherwise: `appointment_id` is nullable and usually
 * null.
 *
 * A call does *not* repeat the conversation's summary, intent, outcome or
 * transcript. It holds what only a call has — duration, status, provider ids —
 * and joins to its conversation for the rest. That is why there is one
 * `transcript` in the database and not two that can disagree.
 *
 * Transcript lines and action checklists are loaded in one query each and
 * grouped in memory rather than fetched per conversation. A page shows a
 * hundred rows; a hundred round trips to render them is the classic way to make
 * a fast database feel slow.
 */
export class ConversationRepository extends WorkspaceScopedRepository {
  async list(): Promise<Conversation[]> {
    const [rows, transcripts, actions] = await Promise.all([
      this.sql`
        select c.*, cu.name as customer_name, ca.duration_sec
        from conversations c
        left join customers cu on cu.id = c.customer_id
        left join calls ca     on ca.conversation_id = c.id
        where c.workspace_id = ${this.ws}
        order by c.started_at desc`,
      this.transcriptsByConversation(),
      this.actionsByConversation(),
    ]);

    return rows.map((row) => toConversation(row, transcripts, actions));
  }

  async findById(id: string): Promise<Conversation | null> {
    const [row] = await this.sql`
      select c.*, cu.name as customer_name, ca.duration_sec
      from conversations c
      left join customers cu on cu.id = c.customer_id
      left join calls ca     on ca.conversation_id = c.id
      where c.id = ${id} and c.workspace_id = ${this.ws}`;
    if (!row) return null;

    const [transcripts, actions] = await Promise.all([
      this.transcriptsByConversation(id),
      this.actionsByConversation(id),
    ]);
    return toConversation(row, transcripts, actions);
  }

  private async transcriptsByConversation(onlyId?: string): Promise<Map<string, Conversation["transcript"]>> {
    const rows = await this.sql`
      select m.conversation_id, m.speaker, m.body, m.offset_label
      from conversation_messages m
      join conversations c on c.id = m.conversation_id
      where c.workspace_id = ${this.ws}
        and (${onlyId ?? null}::text is null or m.conversation_id = ${onlyId ?? null})
      order by m.conversation_id, m.position`;

    const grouped = new Map<string, Conversation["transcript"]>();
    for (const row of rows) {
      const key = str(row.conversation_id);
      const list = grouped.get(key) ?? [];
      list.push({
        speaker: row.speaker === "ai" ? "ai" : "customer",
        text: str(row.body),
        time: str(row.offset_label),
      });
      grouped.set(key, list);
    }
    return grouped;
  }

  private async actionsByConversation(onlyId?: string): Promise<Map<string, ActionStep[]>> {
    const rows = await this.sql`
      select a.conversation_id, a.label, a.done
      from conversation_actions a
      join conversations c on c.id = a.conversation_id
      where c.workspace_id = ${this.ws}
        and (${onlyId ?? null}::text is null or a.conversation_id = ${onlyId ?? null})
      order by a.conversation_id, a.position`;

    const grouped = new Map<string, ActionStep[]>();
    for (const row of rows) {
      const key = str(row.conversation_id);
      const list = grouped.get(key) ?? [];
      list.push({ label: str(row.label), done: row.done === true });
      grouped.set(key, list);
    }
    return grouped;
  }
}

function toConversation(
  row: Row,
  transcripts: Map<string, Conversation["transcript"]>,
  actions: Map<string, ActionStep[]>
): Conversation {
  const id = str(row.id);
  return {
    id,
    customerId: str(row.customer_id),
    customerName: str(row.customer_name),
    channel: str(row.channel) as Conversation["channel"],
    timestamp: iso(row.started_at),
    intent: str(row.intent) as Conversation["intent"],
    outcome: str(row.outcome) as Conversation["outcome"],
    summary: str(row.summary),
    transcriptPreview: str(row.transcript_preview),
    transcript: transcripts.get(id) ?? [],
    appointmentId: row.appointment_id ? str(row.appointment_id) : undefined,
    actions: actions.get(id) ?? [],
    durationSec: row.duration_sec == null ? undefined : num(row.duration_sec),
  };
}
