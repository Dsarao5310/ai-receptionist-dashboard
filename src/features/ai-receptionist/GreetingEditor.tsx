"use client";

import { useMemo, useState } from "react";
import { Bot, Phone, RotateCcw } from "lucide-react";
import type { AppConfiguration } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Label, Textarea } from "@/components/ui/Input";
import { toast } from "@/lib/store/toast";
import { DEFAULT_CONFIGURATION } from "@/data/default-config";
import { cn } from "@/lib/utils";

const MAX_LENGTH = 300;

export function GreetingEditor({ config, onSave }: { config: AppConfiguration; onSave: (greeting: string) => Promise<boolean> }) {
  const stored = config.ai.greeting;
  const [draft, setDraft] = useState(stored);

  // Re-sync if the greeting changes elsewhere (e.g. a reset).
  const [syncedFrom, setSyncedFrom] = useState(stored);
  if (stored !== syncedFrom) {
    setSyncedFrom(stored);
    setDraft(stored);
  }

  const dirty = draft !== stored;
  const tooLong = draft.length > MAX_LENGTH;
  const empty = draft.trim().length === 0;

  /** The default greeting always reflects the current business name, not the seeded one. */
  const defaultGreeting = useMemo(
    () => DEFAULT_CONFIGURATION.ai.greeting.replace(DEFAULT_CONFIGURATION.business.name, config.business.name),
    [config.business.name]
  );

  async function save() {
    if (empty) return toast("Your greeting can't be empty");
    if (tooLong) return toast("Your greeting is too long");
    if (await onSave(draft.trim())) toast.success("Greeting saved");
  }

  return (
    <Card>
      <CardHeader className="flex-col items-start gap-1">
        <CardTitle>Greeting</CardTitle>
        <CardDescription>The first thing customers hear when your receptionist answers.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 pt-4">
        <div>
          <Label htmlFor="greeting">Greeting message</Label>
          <Textarea
            id="greeting"
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            aria-invalid={tooLong || empty}
            aria-describedby="greeting-count"
            className={cn((tooLong || empty) && "border-danger focus-visible:ring-danger")}
          />
          <div className="mt-1 flex items-center justify-between gap-3">
            <p id="greeting-count" className={cn("text-xs", tooLong ? "text-danger" : "text-text-muted")}>
              {draft.length} / {MAX_LENGTH} characters
            </p>
            {empty && (
              <p role="alert" className="text-xs text-danger">
                A greeting is required.
              </p>
            )}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface-sunken p-3.5">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
            <Phone className="h-3 w-3" /> What callers will hear
          </p>
          <div className="flex items-start gap-2.5">
            <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-accent-text">
              <Bot className="h-3.5 w-3.5" />
            </span>
            <p className="text-sm text-text-primary">{draft.trim() || "…"}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={save} disabled={!dirty || empty || tooLong}>
            Save greeting
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setDraft(stored)} disabled={!dirty}>
            Cancel
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => {
              setDraft(defaultGreeting);
              toast("Reset to the default greeting — save to apply.");
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset to default
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
