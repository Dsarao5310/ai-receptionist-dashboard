"use client";

import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { usePermissions } from "@/lib/session-context";
import { AccountSettings } from "@/features/settings/AccountSettings";
import { AppearanceSettings } from "@/features/settings/AppearanceSettings";
import { NotificationSettings } from "@/features/settings/NotificationSettings";
import { DashboardSettings } from "@/features/settings/DashboardSettings";
import { SecuritySettings } from "@/features/settings/SecuritySettings";

/**
 * Client-facing settings: the person and their dashboard.
 *
 * Nothing on this page names a provider, and nothing here configures
 * infrastructure. Workspace, subscription, feature flags and provider
 * configuration live under /admin/settings, which is a separate route group
 * rather than a hidden section of this one — the separation is structural, not
 * a conditional block halfway down a file.
 */
export default function SettingsPage() {
  const { can } = usePermissions();

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-text-primary">Settings</h1>
          <p className="text-sm text-text-secondary">Your account, how the dashboard looks, and what you get told about.</p>
        </div>
        {can("settings.admin") && (
          <Button asChild size="sm" variant="outline">
            <Link href="/admin/settings">
              <ShieldCheck className="h-3.5 w-3.5" /> Workspace administration
            </Link>
          </Button>
        )}
      </div>

      <AccountSettings />
      <AppearanceSettings />
      <NotificationSettings />
      <DashboardSettings />
      <SecuritySettings />
    </div>
  );
}
