"use client";

import { History } from "lucide-react";
import type { Appointment } from "@/types";
import { useConfiguration } from "@/lib/store/configuration";
import { getServiceComparison } from "@/services/business";

/**
 * Explains, quietly, that the service catalogue has moved on since this
 * appointment was booked.
 *
 * This is *visibility only*. The appointment keeps showing its own snapshot
 * everywhere else in the drawer, because that is what the customer was told and
 * what they expect to pay. Nothing here offers to "sync" the booking to current
 * pricing — silently restating an agreed price would be a worse bug than the
 * inconsistency it hides.
 *
 * Renders nothing when the catalogue still matches the booking.
 */
export function ServiceDriftNotice({ appointment }: { appointment: Appointment }) {
  const config = useConfiguration();
  const comparison = getServiceComparison(config, appointment);

  if (!comparison) return null;

  if (comparison.deleted) {
    return (
      <div className="rounded-lg border border-border bg-surface-sunken px-3.5 py-3">
        <p className="flex items-start gap-2 text-xs text-text-secondary">
          <History className="mt-px h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
          <span>
            <span className="font-medium text-text-primary">{comparison.booked.name}</span> is no longer in your current service
            list. The booking details below are unchanged.
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-surface-sunken px-3.5 py-3">
      <p className="flex items-center gap-2 text-xs font-medium text-text-secondary">
        <History className="h-3.5 w-3.5 shrink-0 text-text-muted" aria-hidden="true" />
        Service updated since booking
      </p>
      <dl className="mt-2.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
        <dt className="text-text-muted">Booked as</dt>
        <dd className="text-text-primary">
          {comparison.booked.name}
          {comparison.booked.details && <span className="text-text-secondary"> · {comparison.booked.details}</span>}
        </dd>
        <dt className="text-text-muted">Now</dt>
        <dd className="text-text-secondary">
          {comparison.current?.name}
          {comparison.current?.details && <span> · {comparison.current.details}</span>}
        </dd>
      </dl>
    </div>
  );
}
