import type { SearchParams } from "@/lib/filter-params";
import { readParam } from "@/lib/filter-params";
import SettingsView from "./view";
import { settingsTabsFor } from "./tabs";
import { requireWorkspace } from "@/server/auth/guards";
import { can } from "@/lib/permissions";
import { workspaceScope } from "@/server/db/workspace-scope";
import { serverEnv } from "@/server/env";
import { listErasureRequests } from "@/server/privacy/erasure-requests";

/**
 * `?tab=` seeds the initial section so a link can land directly on one — the
 * sidebar and mobile account menus both point their "Appearance" item here
 * now, and without this they would always land on Account regardless of
 * intent. Read server-side and validated, matching the same pattern
 * `/appointments` uses for its `?status=` drill-down links, rather than
 * `useSearchParams()` client-side.
 */
export default async function SettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const context = await requireWorkspace();
  const canManagePrivacy = can(
    { platformRole: context.user.platformRole, workspaceRole: context.workspaceRole },
    "privacy.manage"
  );
  const [privacyPolicy, erasureRequests] = canManagePrivacy
    ? await Promise.all([
        workspaceScope(context).privacy.getPolicy(),
        listErasureRequests(context),
      ])
    : [null, []];
  const allowedTabs = settingsTabsFor(canManagePrivacy);
  const params = new URLSearchParams(
    Object.entries(await searchParams).flatMap(([k, v]) =>
      v === undefined ? [] : [[k, Array.isArray(v) ? v[0] : v] as [string, string]]
    )
  );

  return (
    <SettingsView
      initialTab={readParam(params, "tab", allowedTabs, "account")}
      privacyPolicy={privacyPolicy}
      erasureRequests={erasureRequests}
      automaticDeletionScheduled={serverEnv.privacyPurgeMode === "scheduled"}
    />
  );
}
