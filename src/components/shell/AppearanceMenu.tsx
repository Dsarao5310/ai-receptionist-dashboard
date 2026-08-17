"use client";

import { Check, Monitor, Moon, Sun, Palette } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { Tooltip } from "@/components/ui/Tooltip";
import { ACCENT_OPTIONS, usePreferences, type Density, type ThemeMode } from "@/lib/store/preferences";
import { cn } from "@/lib/utils";

const THEME_OPTIONS: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

const DENSITY_OPTIONS: { value: Density; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "comfortable", label: "Comfortable" },
  { value: "spacious", label: "Spacious" },
];

export function AppearanceMenu() {
  const theme = usePreferences((s) => s.theme);
  const accent = usePreferences((s) => s.accent);
  const density = usePreferences((s) => s.density);
  const setTheme = usePreferences((s) => s.setTheme);
  const setAccent = usePreferences((s) => s.setAccent);
  const setDensity = usePreferences((s) => s.setDensity);

  return (
    <DropdownMenu>
      <Tooltip content="Appearance">
        <DropdownMenuTrigger asChild>
          <button
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors"
            aria-label="Appearance settings"
          >
            <Palette className="h-[18px] w-[18px]" />
          </button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <div className="grid grid-cols-3 gap-1 px-1.5 pb-1.5">
          {THEME_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setTheme(opt.value)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-md border py-2 text-[11px] font-medium transition-colors",
                theme === opt.value
                  ? "border-accent bg-accent-subtle text-accent-text"
                  : "border-border text-text-secondary hover:bg-surface-hover"
              )}
            >
              <opt.icon className="h-3.5 w-3.5" />
              {opt.label}
            </button>
          ))}
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Accent color</DropdownMenuLabel>
        <div className="grid grid-cols-6 gap-1.5 px-2.5 pb-2">
          {ACCENT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setAccent(opt.value)}
              aria-label={opt.label}
              className="relative flex h-6 w-6 items-center justify-center rounded-full ring-1 ring-inset ring-black/10"
              style={{ backgroundColor: opt.swatch }}
            >
              {accent === opt.value && <Check className="h-3.5 w-3.5 text-white drop-shadow" />}
            </button>
          ))}
        </div>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Density</DropdownMenuLabel>
        <div className="flex flex-col gap-0.5 px-1.5 pb-1.5">
          {DENSITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setDensity(opt.value)}
              className={cn(
                "flex items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors",
                density === opt.value ? "bg-surface-hover text-text-primary" : "text-text-secondary hover:bg-surface-hover"
              )}
            >
              {opt.label}
              {density === opt.value && <Check className="h-3.5 w-3.5 text-accent" />}
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
