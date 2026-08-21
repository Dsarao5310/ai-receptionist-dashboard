import type { SearchParams } from "@/lib/filter-params";
import { readParam } from "@/lib/filter-params";
import type { AppointmentSource, AppointmentStatus } from "@/types";
import AppointmentsView from "./view";

const STATUSES: (AppointmentStatus | "all")[] = ["all", "confirmed", "pending", "rescheduled", "cancelled", "completed"];
const SOURCES: (AppointmentSource | "all")[] = ["all", "voice", "sms", "email", "manual"];

/**
 * Analytics drill-downs arrive as "/appointments?status=cancelled". The values
 * are validated against the known options here, so an unrecognised or
 * hand-typed one falls back to the default rather than putting the page into an
 * impossible state.
 */
export default async function AppointmentsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = new URLSearchParams(
    Object.entries(await searchParams).flatMap(([k, v]) =>
      v === undefined ? [] : [[k, Array.isArray(v) ? v[0] : v] as [string, string]]
    )
  );

  return (
    <AppointmentsView
      initial={{
        status: readParam(params, "status", STATUSES, "all"),
        source: readParam(params, "source", SOURCES, "all"),
      }}
    />
  );
}
