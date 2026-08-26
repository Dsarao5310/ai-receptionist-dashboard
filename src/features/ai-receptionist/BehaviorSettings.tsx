"use client";

import { Check, Info, Volume2 } from "lucide-react";
import type { AIConfiguration, Personality, VoiceSettings } from "@/types";
import { PERSONALITY_OPTIONS, VOICE_OPTIONS, VOICE_TONES } from "@/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/Select";
import { toast } from "@/lib/store/toast";
import { cn } from "@/lib/utils";

/**
 * Business-level behaviour, not model configuration. The owner picks how the
 * receptionist should come across; translating that into instructions for the
 * AI is the backend's job, so no prompt text is exposed here.
 */
export function PersonalitySettings({
  personality,
  onChange,
}: {
  personality: Personality;
  onChange: (p: Personality) => Promise<boolean>;
}) {
  return (
    <Card>
      <CardHeader className="flex-col items-start gap-1">
        <CardTitle>Communication style</CardTitle>
        <CardDescription>How your receptionist comes across to customers.</CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <div role="radiogroup" aria-label="Communication style" className="grid gap-2 sm:grid-cols-2">
          {PERSONALITY_OPTIONS.map((option) => {
            const selected = option.value === personality;
            return (
              <button
                key={option.value}
                role="radio"
                aria-checked={selected}
                onClick={async () => {
                  if (await onChange(option.value)) toast.success(`Style set to ${option.label}`);
                }}
                className={cn(
                  "flex items-start gap-2.5 rounded-lg border p-3.5 text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  selected ? "border-accent bg-accent-subtle/50" : "border-border hover:bg-surface-hover"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                    selected ? "border-accent bg-accent text-white" : "border-border-strong"
                  )}
                >
                  {selected && <Check className="h-2.5 w-2.5" />}
                </span>
                <span className="min-w-0">
                  <span className={cn("block text-sm font-medium", selected ? "text-accent-text" : "text-text-primary")}>
                    {option.label}
                  </span>
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

/**
 * Voice preferences are stored now and applied when a voice provider is
 * connected. The preview is explicitly disabled rather than faked — playing a
 * canned clip would imply a provider is wired up when none is.
 */
export function VoiceSettingsCard({
  voice,
  channelEnabled,
  onChange,
}: {
  voice: VoiceSettings;
  channelEnabled: boolean;
  onChange: (patch: Partial<VoiceSettings>) => void;
}) {
  return (
    <Card>
      <CardHeader className="flex-col items-start gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>Voice</CardTitle>
          {!channelEnabled && <Badge tone="neutral">Voice channel off</Badge>}
        </div>
        <CardDescription>How your receptionist sounds on phone calls.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="voice-name">Voice</Label>
            <Select value={voice.name} onValueChange={(v) => onChange({ name: v })}>
              <SelectTrigger id="voice-name" aria-label="Voice">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VOICE_OPTIONS.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="voice-tone">Tone</Label>
            <Select value={voice.tone} onValueChange={(v) => onChange({ tone: v })}>
              <SelectTrigger id="voice-tone" aria-label="Tone">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VOICE_TONES.map((v) => (
                  <SelectItem key={v} value={v}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="voice-speed" className="mb-0">
              Speaking speed
            </Label>
            <span className="text-sm tabular-nums text-text-secondary">{voice.speedPct}%</span>
          </div>
          <input
            id="voice-speed"
            type="range"
            min={70}
            max={130}
            step={5}
            value={voice.speedPct}
            onChange={(e) => onChange({ speedPct: Number(e.target.value) })}
            aria-valuetext={`${voice.speedPct} percent of normal speed`}
            className="mt-2 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-sunken accent-[var(--color-accent)]"
          />
          <div className="mt-1 flex justify-between text-[11px] text-text-muted">
            <span>Slower</span>
            <span>Normal</span>
            <span>Faster</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border-strong px-3.5 py-3">
          <Button size="sm" variant="outline" disabled>
            <Volume2 className="h-3.5 w-3.5" /> Preview voice
          </Button>
          <p className="flex items-start gap-1.5 text-xs text-text-muted">
            <Info className="mt-0.5 h-3 w-3 shrink-0" />
            Voice preview becomes available once a voice provider is connected. Your choices are saved and applied then.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export type { AIConfiguration };
