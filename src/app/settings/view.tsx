"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/shared/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { usePermissions } from "@/lib/session-context";
import { AccountSettings } from "@/features/settings/AccountSettings";
import { AppearanceSettings } from "@/features/settings/AppearanceSettings";
import { NotificationSettings } from "@/features/settings/NotificationSettings";
import { DashboardSettings } from "@/features/settings/DashboardSettings";
import { SecuritySettings } from "@/features/settings/SecuritySettings";
import { PrivacySettings } from "@/features/settings/PrivacySettings";
import type { PrivacyErasureRequest, WorkspacePrivacyPolicy } from "@/server/privacy/types";
import type { SettingsTab } from "./tabs";

/**
 * Client-facing settings: the person and their dashboard.
 *
 * Nothing on this page names a provider, and nothing here configures
 * infrastructure. Workspace, subscription, feature flags and provider
 * configuration live under /admin/settings, which is a separate route group
 * rather than a hidden section of this one — the separation is structural, not
 * a conditional block halfway down a file.
 *
 * Five sections used to stack as one long column of cards. Tabs are the
 * established pattern for this kind of section-switching (see
 * /business-profile), so they replace the scroll here too.
 *
 * The Account panel is `forceMount`ed and hidden with CSS rather than left to
 * unmount like the rest. It is the only section holding a local unsaved
 * draft — switching away would otherwise silently discard in-progress edits,
 * since a tab switch isn't a navigation the unsaved-changes guard intercepts.
 * The other immediate-save sections write straight through to a store on change, so
 * there is nothing to lose by letting Radix unmount them while inactive.
 */
export default function SettingsView({
  initialTab,
  privacyPolicy,
  erasureRequests,
  automaticDeletionScheduled,
}: {
  initialTab: SettingsTab;
  privacyPolicy: WorkspacePrivacyPolicy | null;
  erasureRequests: PrivacyErasureRequest[];
  automaticDeletionScheduled: boolean;
}) {
  const { can } = usePermissions();
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const tabsRegionRef = useRef<HTMLDivElement>(null);
  const showPrivacy = can("privacy.manage") && privacyPolicy !== null;
  const visibleTab = tab === "privacy" && !showPrivacy ? "account" : tab;

  useEffect(() => {
    const activeTab = tabsRegionRef.current?.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
    activeTab?.scrollIntoView({ behavior: "instant", block: "nearest", inline: "nearest" });
  }, [visibleTab]);

  return (
    <div className="space-y-5">
      <PageHeader
        description="Your account, how the dashboard looks, and what you get told about."
        actions={
          can("settings.admin") ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/admin/settings">
                <ShieldCheck className="h-3.5 w-3.5" /> Workspace administration
              </Link>
            </Button>
          ) : undefined
        }
      />

      <Tabs value={visibleTab} onValueChange={(v) => setTab(v as SettingsTab)}>
        <div
          ref={tabsRegionRef}
          className="-mx-1 overflow-x-auto px-1"
          role="region"
          aria-label="Settings sections"
          tabIndex={0}
        >
          <TabsList>
            <TabsTrigger value="account" className="whitespace-nowrap">
              Account
            </TabsTrigger>
            <TabsTrigger value="appearance" className="whitespace-nowrap">
              Appearance
            </TabsTrigger>
            <TabsTrigger value="notifications" className="whitespace-nowrap">
              Notifications
            </TabsTrigger>
            <TabsTrigger value="dashboard" className="whitespace-nowrap">
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="security" className="whitespace-nowrap">
              Security
            </TabsTrigger>
            {showPrivacy ? (
              <TabsTrigger value="privacy" className="whitespace-nowrap">
                Privacy
              </TabsTrigger>
            ) : null}
          </TabsList>
        </div>

        <TabsContent value="account" forceMount className="data-[state=inactive]:hidden">
          <AccountSettings />
        </TabsContent>
        <TabsContent value="appearance">
          <AppearanceSettings />
        </TabsContent>
        <TabsContent value="notifications">
          <NotificationSettings />
        </TabsContent>
        <TabsContent value="dashboard">
          <DashboardSettings />
        </TabsContent>
        <TabsContent value="security">
          <SecuritySettings />
        </TabsContent>
        {showPrivacy ? (
          <TabsContent value="privacy">
            <PrivacySettings
              policy={privacyPolicy}
              automaticDeletionScheduled={automaticDeletionScheduled}
              erasureRequests={erasureRequests}
            />
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
