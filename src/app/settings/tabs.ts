export type SettingsTab = "account" | "appearance" | "notifications" | "dashboard" | "security" | "privacy";

export const SETTINGS_TABS: readonly SettingsTab[] = ["account", "appearance", "notifications", "dashboard", "security", "privacy"];

export function settingsTabsFor(canManagePrivacy: boolean): readonly SettingsTab[] {
  return canManagePrivacy ? SETTINGS_TABS : SETTINGS_TABS.filter((tab) => tab !== "privacy");
}
