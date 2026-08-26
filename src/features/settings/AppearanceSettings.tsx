"use client";

import type { ReactNode } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/Card";
import { Switch } from "@/components/ui/Switch";
import { ACCENT_OPTIONS, usePreferences, type Density, type ThemeMode } from "@/lib/store/preferences";
import { cn } from "@/lib/utils";

/**
 * The same preferences store the top-bar appearance menu writes to.
 *
 * There is no local copy and no separate "settings theme" — changing it here
 * moves the menu, and vice versa. These are single-choice preferences, so they
 * save immediately rather than through a Save bar, matching the established
 * split: batched forms get Save/Discard, toggles apply at once.
 *
 * Theme, accent and density are three separate "pick one" choices that used to
 * render in three different visual styles (icon-over-label, swatch-and-label,
 * stacked-text-only). `OptionButton` is the one shared shape all three now
 * use, so the card reads as one system instead of three unrelated widgets.
 */

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

const DENSITY_OPTIONS: { value: Density; label: string; hint: string }[] = [
  { value: "compact", label: "Compact", hint: "More on screen" },
  { value: "comfortable", label: "Comfortable", hint: "Balanced" },
  { value: "spacious", label: "Spacious", hint: "Easier to scan" },
];

/** Three horizontal bars whose spacing previews the density they represent. */
function DensityGlyph({ value }: { value: Density }) {
  const gap = value === "compact" ? "gap-[3px]" : value === "comfortable" ? "gap-[5px]" : "gap-[7px]";
  return (
    <span className={cn("flex flex-col items-center", gap)} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-[3px] w-4 rounded-full bg-current" />
      ))}
    </span>
  );
}

function OptionButton({
  selected,
  onClick,
  ariaLabel,
  leading,
  label,
  hint,
}: {
  selected: boolean;
  onClick: () => void;
  ariaLabel?: string;
  leading: ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      aria-label={ariaLabel}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
        selected ? "border-accent bg-accent-subtle" : "border-border text-text-secondary hover:bg-surface-hover"
      )}
    >
      <span
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
          selected ? "bg-surface text-accent-text" : "bg-surface-sunken text-text-muted"
        )}
      >
        {leading}
      </span>
      <span className="min-w-0">
        <span className={cn("block text-xs font-medium", selected ? "text-accent-text" : "text-text-primary")}>
          {label}
        </span>
        {hint && <span className="block truncate text-xs text-text-muted">{hint}</span>}
      </span>
    </button>
  );
}

export function AppearanceSettings() {
  const {
    theme,
    accent,
    density,
    sidebarCollapsed,
    sidebarHoverExpand,
    setTheme,
    setAccent,
    setDensity,
    setSidebarCollapsed,
    setSidebarHoverExpand,
  } = usePreferences();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Applies to this browser. Changes take effect immediately.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <fieldset>
          <legend className="text-xs font-semibold uppercase tracking-wide text-text-muted">Theme</legend>
          <div className="mt-2.5 grid grid-cols-3 gap-2 sm:max-w-lg">
            {THEME_OPTIONS.map((opt) => (
              <OptionButton
                key={opt.value}
                selected={theme === opt.value}
                onClick={() => setTheme(opt.value)}
                label={opt.label}
                leading={<opt.icon className="h-4 w-4" aria-hidden="true" />}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="border-t border-border pt-5">
          <legend className="text-xs font-semibold uppercase tracking-wide text-text-muted">Accent colour</legend>
          <div className="mt-2.5 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {ACCENT_OPTIONS.map((opt) => (
              <OptionButton
                key={opt.value}
                selected={accent === opt.value}
                onClick={() => setAccent(opt.value)}
                ariaLabel={opt.label}
                label={opt.label}
                leading={<span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: opt.swatch }} />}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="border-t border-border pt-5">
          <legend className="text-xs font-semibold uppercase tracking-wide text-text-muted">Density</legend>
          <div className="mt-2.5 grid grid-cols-3 gap-2 sm:max-w-lg">
            {DENSITY_OPTIONS.map((opt) => (
              <OptionButton
                key={opt.value}
                selected={density === opt.value}
                onClick={() => setDensity(opt.value)}
                label={opt.label}
                hint={opt.hint}
                leading={<DensityGlyph value={opt.value} />}
              />
            ))}
          </div>
        </fieldset>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-5">
          <div>
            <label htmlFor="sidebar-pref" className="text-sm text-text-primary">
              Start with the sidebar collapsed
            </label>
            <p className="text-xs text-text-muted">Gives content more room on smaller screens.</p>
          </div>
          <Switch
            id="sidebar-pref"
            checked={sidebarCollapsed}
            onCheckedChange={setSidebarCollapsed}
            aria-label="Start with the sidebar collapsed"
          />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-5">
          <div>
            <label htmlFor="sidebar-hover-pref" className="text-sm text-text-primary">
              Expand on hover
            </label>
            <p className="text-xs text-text-muted">
              While collapsed, hovering the sidebar briefly shows the full labels.
            </p>
          </div>
          <Switch
            id="sidebar-hover-pref"
            checked={sidebarHoverExpand}
            onCheckedChange={setSidebarHoverExpand}
            aria-label="Expand sidebar on hover"
          />
        </div>
      </CardContent>
    </Card>
  );
}
