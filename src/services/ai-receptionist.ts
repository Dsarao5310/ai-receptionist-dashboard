import type {
  AppConfiguration,
  CapabilityKey,
  ConnectionState,
  Dataset,
  ReceptionistStatus,
} from "@/types";
import type { CapabilityStatusEntry } from "./integrations";
import { businessZone, isOutsideBusinessHours } from "./business";
import { startOfZonedDay } from "@/lib/timezone";

/**
 * Business-facing view of the receptionist. Deliberately expressed as
 * Voice/SMS/Email/Calendar rather than the providers behind them, so swapping a
 * provider later never reaches this layer or the UI above it.
 */
export function getReceptionistStatus(
  config: AppConfiguration,
  capabilities: CapabilityStatusEntry[]
): ReceptionistStatus {
  const { enabled, channels } = config.ai;
  const statusOf = (key: CapabilityKey) =>
    capabilities.find((c) => c.key === key)?.status ?? "not_configured";

  /**
   * A channel is only online if the owner has switched it on *and* the
   * capability behind it is working. The capability half is derived once, on
   * the server, from the provider records — one source of truth, no way for
   * this to disagree with the Connections page, and no vendor name reaches a
   * business user to do it.
   */
  const channelState = (on: boolean, capability: CapabilityKey): ConnectionState => {
    if (!enabled || !on) return "disconnected";
    switch (statusOf(capability)) {
      case "connected":
        return "connected";
      case "not_configured":
        return "disconnected";
      default:
        return "needs_attention";
    }
  };

  const voice = channelState(channels.voice, "voice");
  const sms = channelState(channels.sms, "sms");
  const email = channelState(channels.email, "email");

  const calendarStatus = statusOf("calendar");
  const calendar: ConnectionState =
    calendarStatus === "connected" ? "connected" : calendarStatus === "not_configured" ? "disconnected" : "needs_attention";

  const liveChannels = [voice, sms, email].filter((s) => s === "connected").length;

  return {
    overall: !enabled || liveChannels === 0 ? "offline" : liveChannels < 3 ? "degraded" : "online",
    voice,
    sms,
    email,
    calendar,
  };
}

export interface ReceptionistActivity {
  conversationsToday: number;
  appointmentsToday: number;
  afterHoursToday: number;
  lastActivity: string | null;
}

/**
 * Today's activity, read from the same shared dataset that powers Overview and
 * Analytics — no separate counters that could disagree with those pages.
 */
export function getReceptionistActivity(config: AppConfiguration, dataset: Dataset | null, now: Date): ReceptionistActivity {
  if (!dataset) return { conversationsToday: 0, appointmentsToday: 0, afterHoursToday: 0, lastActivity: null };

  // "Today" is the business's day. Using the browser's midnight would move the
  // cut-off by hours for anyone viewing from another timezone, so the headline
  // counts would disagree with what the business actually handled today.
  const startOfToday = startOfZonedDay(now, businessZone(config));
  const inToday = (iso: string) => new Date(iso).getTime() >= startOfToday.getTime();

  const conversationsToday = dataset.conversations.filter((c) => inToday(c.timestamp));
  const appointmentsToday = dataset.appointments.filter((a) => inToday(a.createdAt));

  return {
    conversationsToday: conversationsToday.length,
    appointmentsToday: appointmentsToday.length,
    afterHoursToday: conversationsToday.filter((c) => isOutsideBusinessHours(config, c.timestamp)).length,
    lastActivity: dataset.conversations[0]?.timestamp ?? null,
  };
}
