"use client";

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

export function AppearanceSettings() {
  const { theme, accent, density, sidebarCollapsed, setTheme, setAccent, setDensity, setSidebarCollapsed } =
    usePreferences();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Applies to this browser. Changes take effect immediately.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <fieldset>
          <legend className="text-xs font-semibold uppercase tracking-wide text-text-muted">Theme</legend>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:max-w-md">
            {THEME_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                aria-pressed={theme === opt.value}
                className={cn(
                  "flex flex-col items-center gap-1.5 rounded-lg border py-3 text-xs font-medium transition-colors",
                  theme === opt.value
                    ? "border-accent bg-accent-subtle text-accent-text"
                    : "border-border text-text-secondary hover:bg-surface-hover"
                )}
              >
                <opt.icon className="h-4 w-4" aria-hidden="true" />
                {opt.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-xs font-semibold uppercase tracking-wide text-text-muted">Accent colour</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {ACCENT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setAccent(opt.value)}
                aria-pressed={accent === opt.value}
                aria-label={opt.label}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                  accent === opt.value
                    ? "border-accent bg-accent-subtle text-accent-text"
                    : "border-border text-text-secondary hover:bg-surface-hover"
                )}
              >
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: opt.swatch }} aria-hidden="true" />
                {opt.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-xs font-semibold uppercase tracking-wide text-text-muted">Density</legend>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:max-w-md">
            {DENSITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setDensity(opt.value)}
                aria-pressed={density === opt.value}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-left transition-colors",
                  density === opt.value
                    ? "border-accent bg-accent-subtle"
                    : "border-border hover:bg-surface-hover"
                )}
              >
                <span
                  className={cn("block text-xs font-medium", density === opt.value ? "text-accent-text" : "text-text-primary")}
                >
                  {opt.label}
                </span>
                <span className="block text-xs text-text-muted">{opt.hint}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
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
      </CardContent>
    </Card>
  );
}
