import type { SearchParams } from "@/lib/filter-params";
import { readParam } from "@/lib/filter-params";
import type { Channel, ConversationOutcome, Intent } from "@/types";
import ConversationsView from "./view";

const CHANNELS: (Channel | "all")[] = ["all", "voice", "sms", "email"];
const INTENTS: (Intent | "all")[] = ["all", "booking", "reschedule", "cancel", "hours", "pricing", "services", "other"];
const OUTCOMES: (ConversationOutcome | "all")[] = [
  "all", "booked", "rescheduled", "cancelled", "answered", "escalated", "missed", "no_action",
];

export default async function ConversationsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = new URLSearchParams(
    Object.entries(await searchParams).flatMap(([k, v]) =>
      v === undefined ? [] : [[k, Array.isArray(v) ? v[0] : v] as [string, string]]
    )
  );

  return (
    <ConversationsView
      initial={{
        channel: readParam(params, "channel", CHANNELS, "all"),
        intent: readParam(params, "intent", INTENTS, "all"),
        outcome: readParam(params, "outcome", OUTCOMES, "all"),
      }}
    />
  );
}
