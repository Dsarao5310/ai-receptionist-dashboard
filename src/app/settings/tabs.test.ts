import { describe, expect, it } from "vitest";
import { SETTINGS_TABS, settingsTabsFor } from "./tabs";

describe("settings tab visibility", () => {
  it("includes privacy for authorized owners and operators", () => {
    expect(settingsTabsFor(true)).toContain("privacy");
  });

  it("removes privacy for unauthorized roles without mutating the shared list", () => {
    expect(settingsTabsFor(false)).not.toContain("privacy");
    expect(SETTINGS_TABS).toContain("privacy");
  });
});
