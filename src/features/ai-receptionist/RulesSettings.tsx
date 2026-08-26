"use client";

import type { AfterHoursBehavior, BookingRules, EscalationRules, UnsureBehavior } from "@/types";
import { AFTER_HOURS_OPTIONS, UNSURE_OPTIONS } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input, Label } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { toast } from "@/lib/store/toast";
import { numberInRange } from "@/lib/validation";
import { cn } from "@/lib/utils";

const NOTICE_OPTIONS = [
  { value: 0, label: "No minimum" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 1440, label: "24 hours" },
];

const ADVANCE_OPTIONS = [30, 60, 90, 180, 365];

const validateDuration = numberInRange("Appointment duration", 5, 480);
const validateConcurrent = numberInRange("Concurrent appointments", 1, 50);

/** Business rules the receptionist follows when booking. No scheduling internals surfaced. */
export function BookingRulesCard({ booking, onChange }: { booking: BookingRules; onChange: (patch: Partial<BookingRules>) => Promise<boolean> }) {
  const durationError = validateDuration(booking.defaultDurationMin);
  const concurrentError = validateConcurrent(booking.maxConcurrent);

  return (
    <Card>
      <CardHeader className="flex-col items-start gap-1">
        <CardTitle>Booking rules</CardTitle>
        <CardDescription>The limits your receptionist works within when making appointments.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="rule-duration">Default appointment length</Label>
            <div className="flex items-center gap-2">
              <Input
                id="rule-duration"
                type="number"
                min={5}
                max={480}
                step={5}
                value={booking.defaultDurationMin}
                onChange={(e) => onChange({ defaultDurationMin: Number(e.target.value) })}
                aria-invalid={!!durationError}
                aria-describedby={durationError ? "rule-duration-error" : undefined}
                className={cn(durationError && "border-danger focus-visible:ring-danger")}
              />
              <span className="shrink-0 text-sm text-text-muted">minutes</span>
            </div>
            {durationError && (
              <p id="rule-duration-error" role="alert" className="mt-1 text-xs text-danger">
                {durationError}
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="rule-concurrent">Appointments at the same time</Label>
            <Input
              id="rule-concurrent"
              type="number"
              min={1}
              max={50}
              value={booking.maxConcurrent}
              onChange={(e) => onChange({ maxConcurrent: Number(e.target.value) })}
              aria-invalid={!!concurrentError}
              aria-describedby={concurrentError ? "rule-concurrent-error" : "rule-concurrent-hint"}
              className={cn(concurrentError && "border-danger focus-visible:ring-danger")}
            />
            {concurrentError ? (
              <p id="rule-concurrent-error" role="alert" className="mt-1 text-xs text-danger">
                {concurrentError}
              </p>
            ) : (
              <p id="rule-concurrent-hint" className="mt-1 text-xs text-text-muted">
                How many customers you can serve at once.
              </p>
            )}
          </div>

          <div>
            <Label htmlFor="rule-notice">Minimum booking notice</Label>
            <Select value={String(booking.minNoticeMin)} onValueChange={(v) => onChange({ minNoticeMin: Number(v) })}>
              <SelectTrigger id="rule-notice" aria-label="Minimum booking notice">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NOTICE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={String(o.value)}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="rule-advance">Book up to</Label>
            <Select value={String(booking.maxAdvanceDays)} onValueChange={(v) => onChange({ maxAdvanceDays: Number(v) })}>
              <SelectTrigger id="rule-advance" aria-label="Maximum advance booking">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADVANCE_OPTIONS.map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d} days ahead
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1 border-t border-border pt-4">
          {(
            [
              { key: "sendConfirmation", label: "Send a confirmation", hint: "Customers get a confirmation after booking." },
              { key: "allowReschedule", label: "Allow rescheduling", hint: "Customers can move their own appointment." },
              { key: "allowCancellation", label: "Allow cancellation", hint: "Customers can cancel without calling." },
            ] as const
          ).map((row) => (
            <div key={row.key} className="flex items-center gap-3 rounded-lg px-2 py-2 -mx-2 hover:bg-surface-hover/60 transition-colors">
              <div className="min-w-0 flex-1">
                <label htmlFor={`rule-${row.key}`} className="block text-sm text-text-primary cursor-pointer">
                  {row.label}
                </label>
                <p className="text-xs text-text-muted">{row.hint}</p>
              </div>
              <Switch
                id={`rule-${row.key}`}
                checked={booking[row.key]}
                onCheckedChange={async (v) => {
                  if (await onChange({ [row.key]: v } as Partial<BookingRules>)) {
                    toast.success(`${row.label} ${v ? "on" : "off"}`);
                  }
                }}
              />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function BehaviorSelect({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint: string;
  value: UnsureBehavior;
  onChange: (v: UnsureBehavior) => void;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as UnsureBehavior)}>
        <SelectTrigger id={id} aria-label={label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {UNSURE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="mt-1 text-xs text-text-muted">{hint}</p>
    </div>
  );
}

export function EscalationCard({ escalation, onChange }: { escalation: EscalationRules; onChange: (patch: Partial<EscalationRules>) => void }) {
  return (
    <Card>
      <CardHeader className="flex-col items-start gap-1">
        <CardTitle>When the receptionist can&apos;t help</CardTitle>
        <CardDescription>What should happen when a request is beyond what it can handle.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 pt-4 sm:grid-cols-3">
        <BehaviorSelect
          id="esc-unsure"
          label="If it's unsure"
          hint="The most common case."
          value={escalation.whenUnsure}
          onChange={(v) => onChange({ whenUnsure: v })}
        />
        <BehaviorSelect
          id="esc-urgent"
          label="Urgent requests"
          hint="Something that can't wait."
          value={escalation.urgentRequests}
          onChange={(v) => onChange({ urgentRequests: v })}
        />
        <BehaviorSelect
          id="esc-unsupported"
          label="Requests it can't do"
          hint="Outside what you offer."
          value={escalation.unsupportedRequests}
          onChange={(v) => onChange({ unsupportedRequests: v })}
        />
      </CardContent>
    </Card>
  );
}

export function AfterHoursCard({ value, onChange }: { value: AfterHoursBehavior; onChange: (v: AfterHoursBehavior) => Promise<boolean> }) {
  return (
    <Card>
      <CardHeader className="flex-col items-start gap-1">
        <CardTitle>Outside business hours</CardTitle>
        <CardDescription>What your receptionist does when customers get in touch while you&apos;re closed.</CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <div role="radiogroup" aria-label="After-hours behaviour" className="space-y-1.5">
          {AFTER_HOURS_OPTIONS.map((option) => {
            const selected = option.value === value;
            return (
              <button
                key={option.value}
                role="radio"
                aria-checked={selected}
                onClick={async () => {
                  if (await onChange(option.value)) toast.success(`After-hours: ${option.label}`);
                }}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-lg border p-3 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  selected ? "border-accent bg-accent-subtle/50" : "border-border hover:bg-surface-hover"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2",
                    selected ? "border-accent bg-accent" : "border-border-strong"
                  )}
                />
                <span className="min-w-0">
                  <span className={cn("block text-sm font-medium", selected ? "text-accent-text" : "text-text-primary")}>{option.label}</span>
                  <span className="mt-0.5 block text-xs text-text-muted">{option.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
