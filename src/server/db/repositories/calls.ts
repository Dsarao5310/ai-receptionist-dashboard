import "server-only";

import type { Call, Conversation } from "@/types";
import { iso, num, str, WorkspaceScopedRepository, type Row } from "./base";
import { ConversationRepository } from "./conversations";

/**
 * Calls, assembled from the call row plus its conversation.
 *
 * The `Call` shape the UI works with carries the summary, intent, outcome and
 * transcript. Those live on the conversation; this repository joins them rather
 * than storing a second copy, so a conversation and its call can never tell
 * different stories.
 */
export class CallRepository extends WorkspaceScopedRepository {
  constructor(
    sql: ConstructorParameters<typeof WorkspaceScopedRepository>[0],
    ws: string,
    private readonly includeSensitive = false
  ) {
    super(sql, ws);
    this.conversations = new ConversationRepository(sql, ws, includeSensitive);
  }

  private readonly conversations: ConversationRepository;

  async list(): Promise<Call[]> {
    const [rows, conversations] = await Promise.all([
      this.sql`
        select ca.*, cu.name as customer_name, cu.phone as customer_phone,
               co.intent, co.outcome, co.summary, co.appointment_id
        from calls ca
        join conversations co on co.id = ca.conversation_id
        left join customers cu on cu.id = ca.customer_id
        where ca.workspace_id = ${this.ws}
        order by ca.started_at desc`,
      this.conversations.list(),
    ]);

    const byId = new Map(conversations.map((c) => [c.id, c]));
    return rows.map((row) => toCall(row, byId.get(str(row.conversation_id))));
  }
}

function toCall(row: Row, conversation: Conversation | undefined): Call {
  return {
    id: str(row.id),
    conversationId: str(row.conversation_id),
    customerId: str(row.customer_id),
    customerName: str(row.customer_name),
    customerPhone: str(row.customer_phone),
    timestamp: iso(row.started_at),
    durationSec: num(row.duration_sec),
    intent: str(row.intent) as Call["intent"],
    outcome: str(row.outcome) as Call["outcome"],
    appointmentId: row.appointment_id ? str(row.appointment_id) : undefined,
    summary: conversation?.summary ?? "",
    transcript: conversation?.transcript ?? [],
    actions: conversation?.actions ?? [],
  };
}
