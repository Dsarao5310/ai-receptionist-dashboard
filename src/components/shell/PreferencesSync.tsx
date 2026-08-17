"use client";

import { useEffect } from "react";
import { usePreferences } from "@/lib/store/preferences";

/** Keeps <html data-theme/data-accent/data-density> in sync with the preferences store after mount/changes. */
export function PreferencesSync() {
  const theme = usePreferences((s) => s.theme);
  const accent = usePreferences((s) => s.accent);
  const density = usePreferences((s) => s.density);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light" || theme === "dark") {
      root.setAttribute("data-theme", theme);
    } else {
      root.removeAttribute("data-theme");
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-accent", accent);
  }, [accent]);

  useEffect(() => {
    document.documentElement.setAttribute("data-density", density);
  }, [density]);

  return null;
}
