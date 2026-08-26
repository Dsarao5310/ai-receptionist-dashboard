import type { ConnectionState, ReceptionistStatus } from "@/types";

/**
 * The four connection channels, as a flat list PeriodSummary filters for
 * "what needs attention." Previously the input to a composite 0–100 score
 * shown on its own "Receptionist readiness" card; that card was removed
 * (StatusStrip and PeriodSummary already said everything it said), and the
 * scoring math went with it rather than staying as unread computation.
 */
const CHANNELS: (keyof Omit<ReceptionistStatus, "overall">)[] = ["calendar", "voice", "sms", "email"];

const CHANNEL_LABELS: Record<(typeof CHANNELS)[number], string> = {
  calendar: "Calendar",
  voice: "Voice",
  sms: "SMS",
  email: "Email",
};

export interface ReadinessChannel {
  key: (typeof CHANNELS)[number];
  label: string;
  state: ConnectionState;
}

export function getReadiness(status: ReceptionistStatus): ReadinessChannel[] {
  return CHANNELS.map((key) => ({ key, label: CHANNEL_LABELS[key], state: status[key] }));
}
