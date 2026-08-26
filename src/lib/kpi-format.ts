import type { KPI } from "@/types";

/**
 * Shared formatting for a KPI's value and period-over-period delta.
 *
 * Extracted from KPICard so the same rules apply wherever a KPI's number is
 * shown — a card tile, or a chart header — instead of two independent copies
 * quietly drifting apart.
 */
export function formatKpiValue(kpi: Pick<KPI, "value" | "format">): string {
  if (kpi.format === "percent") return `${Math.round(kpi.value)}%`;
  if (kpi.format === "currency") return `$${Math.round(kpi.value).toLocaleString()}`;
  return Math.round(kpi.value).toLocaleString();
}

export interface KpiDelta {
  text: string;
  positive: boolean;
  flat: boolean;
}

export function formatKpiDelta(kpi: Pick<KPI, "value" | "previousValue" | "format">): KpiDelta {
  if (kpi.format === "percent") {
    const pts = kpi.value - kpi.previousValue;
    return { text: `${pts >= 0 ? "+" : ""}${pts.toFixed(1)} pts`, positive: pts >= 0, flat: Math.abs(pts) < 0.05 };
  }
  if (kpi.previousValue === 0) {
    return { text: kpi.value > 0 ? "New" : "—", positive: kpi.value > 0, flat: kpi.value === 0 };
  }
  const pct = ((kpi.value - kpi.previousValue) / kpi.previousValue) * 100;
  const capped = Math.max(-999, Math.min(999, pct));
  const suffix = Math.abs(pct) > 999 ? "%+" : "%";
  return { text: `${capped >= 0 ? "+" : ""}${capped.toFixed(0)}${suffix}`, positive: pct >= 0, flat: Math.abs(pct) < 0.5 };
}

/** Metrics where a decrease is the good direction — invert the color semantics. */
export const INVERTED_KPI_KEYS = new Set(["missed_escalated", "cancellations", "reschedules"]);

/**
 * Where each KPI tile drills down to, reusing the exact query-param
 * vocabulary the rest of Analytics already established — see
 * `AppointmentOutcomes`/`ChannelPerformance`/`IntentDistribution`
 * (`/appointments?status=`, `/conversations?intent=`) and
 * `ReceptionistImpact` (`/calls?outcome=missed`). One shared map for
 * Overview and Analytics, which both surface the same KPI keys, so the two
 * pages can't quietly drift onto different destinations for the same metric.
 *
 * A key not listed here has no sensible single-page destination and the
 * tile stays a plain, honestly non-interactive card.
 */
export const KPI_DRILL_HREF: Record<string, string> = {
  conversations_handled: "/conversations",
  appointments_booked: "/appointments",
  calls_answered: "/calls?outcome=answered",
  answer_rate: "/calls",
  booking_conversion: "/conversations?intent=booking",
  missed_escalated: "/calls?outcome=missed",
  reschedules: "/appointments?status=rescheduled",
  cancellations: "/appointments?status=cancelled",
};
