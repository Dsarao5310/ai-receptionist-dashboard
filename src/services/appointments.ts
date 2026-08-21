import type { AppConfiguration, Appointment, AppointmentSource, AppointmentStatus, Dataset } from "@/types";
import { inBounds, type Bounds } from "@/lib/date-range";
import { appointmentInstant } from "./business";
import type { PagedResult, SortDirection } from "./conversations";

export type AppointmentSortField = "customerName" | "date";

export interface AppointmentFilters {
  search?: string;
  status?: AppointmentStatus | "all";
  source?: AppointmentSource | "all";
  bounds?: Bounds;
  sortBy?: AppointmentSortField;
  sortDir?: SortDirection;
  page?: number;
  pageSize?: number;
}

/**
 * `config` supplies the business timezone: an appointment's stored date and time
 * are wall-clock values in that zone, so filtering and sorting must resolve them
 * there rather than in whatever zone the browser is set to.
 */
export function getAppointments(dataset: Dataset, config: AppConfiguration, filters: AppointmentFilters = {}): PagedResult<Appointment> {
  let items = dataset.appointments;
  const instantOf = (a: Appointment) => appointmentInstant(config, a);

  if (filters.bounds) items = items.filter((a) => inBounds(instantOf(a), filters.bounds!));
  if (filters.status && filters.status !== "all") items = items.filter((a) => a.status === filters.status);
  if (filters.source && filters.source !== "all") items = items.filter((a) => a.source === filters.source);
  if (filters.search?.trim()) {
    const q = filters.search.trim().toLowerCase();
    // Matches the service name as booked, so searching still finds historical
    // appointments after the catalogue entry has been renamed.
    items = items.filter((a) => a.customerName.toLowerCase().includes(q) || a.service.name.toLowerCase().includes(q));
  }

  const sortBy = filters.sortBy ?? "date";
  const sortDir = filters.sortDir ?? "asc";
  const sorted = [...items].sort((a, b) => {
    const cmp = sortBy === "date" ? instantOf(a).getTime() - instantOf(b).getTime() : a.customerName.localeCompare(b.customerName);
    return sortDir === "asc" ? cmp : -cmp;
  });

  const total = sorted.length;
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 15;
  const start = (page - 1) * pageSize;

  return { items: sorted.slice(start, start + pageSize), total };
}
