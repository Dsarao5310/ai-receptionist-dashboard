"use client";

import { useEffect, useMemo, useState } from "react";
import type { BusinessIdentity } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Input, Label, Textarea } from "@/components/ui/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { SaveBar } from "@/components/shared/SaveBar";
import { toast } from "@/lib/store/toast";
import { email as emailRule, phone as phoneRule, required, runValidators, website as websiteRule, type Validator } from "@/lib/validation";
import { cn } from "@/lib/utils";

const TIMEZONES = [
  "America/Vancouver",
  "America/Edmonton",
  "America/Winnipeg",
  "America/Toronto",
  "America/Halifax",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "Europe/London",
  "Europe/Dublin",
  "Australia/Sydney",
];

const FIELDS: { key: keyof BusinessIdentity; label: string; hint?: string; validators: Validator[]; type?: string; placeholder?: string }[] = [
  { key: "name", label: "Business name", validators: [required("Business name")], placeholder: "Your business name" },
  { key: "phone", label: "Public phone", hint: "The number customers call", validators: [required("Phone"), phoneRule], type: "tel", placeholder: "(604) 555-0142" },
  { key: "email", label: "Public email", validators: [emailRule], type: "email", placeholder: "hello@example.com" },
  { key: "website", label: "Website", validators: [websiteRule], placeholder: "https://example.com" },
  { key: "address", label: "Address", validators: [required("Address")], placeholder: "Street, city, postal code" },
  { key: "category", label: "Business category", hint: "How you'd describe your business", validators: [], placeholder: "e.g. Salon & Spa, Dental Clinic" },
];

/** Field-level validation used both while typing and again on save. */
function validateAll(draft: BusinessIdentity): Partial<Record<keyof BusinessIdentity, string>> {
  const errors: Partial<Record<keyof BusinessIdentity, string>> = {};
  for (const field of FIELDS) {
    const message = runValidators(String(draft[field.key] ?? ""), field.validators);
    if (message) errors[field.key] = message;
  }
  return errors;
}

export function BusinessDetailsForm({
  value,
  onSave,
  onDirtyChange,
}: {
  value: BusinessIdentity;
  onSave: (next: BusinessIdentity) => Promise<boolean>;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState<BusinessIdentity>(value);
  const [touched, setTouched] = useState<Partial<Record<keyof BusinessIdentity, boolean>>>({});

  // Re-sync when the stored value changes identity (a save, or a reset from
  // elsewhere). React's "adjust state during render" pattern — an effect would
  // render once with a stale draft first.
  const [syncedFrom, setSyncedFrom] = useState(value);
  if (value !== syncedFrom) {
    setSyncedFrom(value);
    setDraft(value);
  }

  const errors = useMemo(() => validateAll(draft), [draft]);
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(value), [draft, value]);
  const hasErrors = Object.keys(errors).length > 0;

  useEffect(() => onDirtyChange(dirty), [dirty, onDirtyChange]);

  function set<K extends keyof BusinessIdentity>(key: K, v: BusinessIdentity[K]) {
    setDraft((d) => ({ ...d, [key]: v }));
  }

  async function handleSave() {
    if (hasErrors) {
      // Reveal every problem at once rather than one per attempt.
      setTouched(Object.fromEntries(FIELDS.map((f) => [f.key, true])));
      toast("Please fix the highlighted fields");
      return;
    }
    if (!(await onSave(draft))) return;
    setTouched({});
    toast.success("Business details saved");
  }

  return (
    <>
      <Card>
        <CardHeader className="flex-col items-start gap-1">
          <CardTitle>Business details</CardTitle>
          <CardDescription>This is the information your AI receptionist gives out to customers.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 pt-4 sm:grid-cols-2">
          {FIELDS.map((field) => {
            const error = touched[field.key] ? errors[field.key] : undefined;
            const id = `business-${field.key}`;
            return (
              <div key={field.key} className={field.key === "address" ? "sm:col-span-2" : undefined}>
                <Label htmlFor={id}>{field.label}</Label>
                <Input
                  id={id}
                  type={field.type ?? "text"}
                  value={String(draft[field.key] ?? "")}
                  placeholder={field.placeholder}
                  onChange={(e) => set(field.key, e.target.value)}
                  onBlur={() => setTouched((t) => ({ ...t, [field.key]: true }))}
                  aria-invalid={!!error}
                  aria-describedby={error ? `${id}-error` : field.hint ? `${id}-hint` : undefined}
                  className={cn(error && "border-danger focus-visible:ring-danger")}
                />
                {error ? (
                  <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-danger">
                    {error}
                  </p>
                ) : field.hint ? (
                  <p id={`${id}-hint`} className="mt-1 text-xs text-text-muted">
                    {field.hint}
                  </p>
                ) : null}
              </div>
            );
          })}

          <div>
            <Label htmlFor="business-timezone">Timezone</Label>
            <Select value={draft.timezone} onValueChange={(v) => set("timezone", v)}>
              <SelectTrigger id="business-timezone" aria-label="Timezone">
                <SelectValue placeholder="Select a timezone" />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz} value={tz}>
                    {tz.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-text-muted">Used to interpret your opening hours and bookings.</p>
          </div>

          <div className="sm:col-span-2">
            <Label htmlFor="business-description">Short description</Label>
            <Textarea
              id="business-description"
              rows={3}
              value={draft.description}
              placeholder="A sentence or two about what your business does."
              onChange={(e) => set("description", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <SaveBar dirty={dirty} onSave={handleSave} onCancel={() => { setDraft(value); setTouched({}); }} />
    </>
  );
}
