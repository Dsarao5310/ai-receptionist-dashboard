"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ThemeMode = "light" | "dark" | "system";
export type AccentColor = "blue" | "indigo" | "emerald" | "orange" | "rose" | "neutral";
export type Density = "compact" | "comfortable" | "spacious";

interface PreferencesState {
  theme: ThemeMode;
  accent: AccentColor;
  density: Density;
  sidebarCollapsed: boolean;
  setTheme: (theme: ThemeMode) => void;
  setAccent: (accent: AccentColor) => void;
  setDensity: (density: Density) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
}

export const usePreferences = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: "system",
      accent: "indigo",
      density: "comfortable",
      sidebarCollapsed: false,
      setTheme: (theme) => set({ theme }),
      setAccent: (accent) => set({ accent }),
      setDensity: (density) => set({ density }),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    { name: "ai-receptionist-preferences" }
  )
);

export const ACCENT_OPTIONS: { value: AccentColor; label: string; swatch: string }[] = [
  { value: "blue", label: "Blue", swatch: "#2563a8" },
  { value: "indigo", label: "Indigo", swatch: "#4f46e5" },
  { value: "emerald", label: "Emerald", swatch: "#16794f" },
  { value: "orange", label: "Orange", swatch: "#c2590e" },
  { value: "rose", label: "Rose", swatch: "#be3455" },
  { value: "neutral", label: "Neutral", swatch: "#44403c" },
];
