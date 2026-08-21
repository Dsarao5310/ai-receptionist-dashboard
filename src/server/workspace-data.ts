import "server-only";

import type {
  AppConfiguration,
  AppNotification,
  Appointment,
  Dataset,
  IntegrationEvent,
  IntegrationRecord,
  WorkflowMapping,
  Workspace,
} from "@/types";
import type { AuthContext } from "@/server/auth/policy";
import { can } from "@/lib/permissions";
import type { CapabilityStatusEntry } from "@/services/integrations";
import { getCapabilityStatuses } from "@/services/integrations-providers";
import { workspaceScope, type WorkspaceScope } from "@/server/db/workspace-scope";
import { effectiveIntegrationRecord } from "@/server/integrations/registry";
import type { WorkspaceUserSettings } from "@/server/db/repositories/settings";
import { serverNow } from "./clock";

/**
 * Everything one page load needs, for one authorized workspace.
 *
 * ── Why this exists as a single loader ──────────────────────────────────────
 * The dashboard's pages are views over one shared dataset — Overview, Analytics
 * and Customers all describe the same conversations and appointments from
 * different angles. Loading it once in the layout and passing it down keeps
 * those views consistent with each other by construction: there is no window in
 * which Overview is showing one snapshot and Analytics another.
 *
 * ── Scoping ─────────────────────────────────────────────────────────────────
 * Nothing here takes a workspace id. It takes an `AuthContext`, which only
 * `authorizeWorkspace` can produce, and hands it to `workspaceScope`, which
 * binds every repository to the authorized id. There is no argument through
 * which a caller could ask for a different tenant's data, and no repository
 * method that would answer if there were.
 *
 * ── Failure is failure ──────────────────────────────────────────────────────
 * If the database is unreachable, this throws and the page shows an error. It
 * does not fall back to generating plausible data in the browser. A dashboard
 * that silently invents a business's numbers when its own storage is down is
 * worse than one that admits it is broken.
 */
export interface WorkspaceDashboardData {
  dataset: Dataset;
  configuration: AppConfiguration;
  workspace: Workspace;
  notifications: AppNotification[];
  /**
   * What the business can currently do, named as Voice/SMS/Email/Calendar.
   * Derived from the provider records on the server and safe for every role.
   */
  capabilities: CapabilityStatusEntry[];
  /** When the capabilities were last verified. Safe for every role. */
  capabilitiesCheckedAt: string | null;
  /**
   * Provider-level records, and the events and workflow mappings beside them.
   *
   * Empty unless the caller holds `integrations.view`, which is platform-only.
   * This is not a UI decision: whatever is in this object is serialised into the
   * page's payload and readable by anyone who opens the network tab, so hiding
   * the admin screens would do nothing while the data still shipped. A business
   * owner reads `capabilities` and never learns which vendor is behind them.
   */
  integrations: IntegrationRecord[];
  integrationEvents: IntegrationEvent[];
  workflows: WorkflowMapping[];
  settings: WorkspaceUserSettings;
  /** The signed-in person's own details, which follow them across workspaces. */
  account: { name: string; email: string; jobTitle: string };
}

/** The start of the current billing period, for usage counters. */
function periodStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function loadWorkspaceDashboard(context: AuthContext): Promise<WorkspaceDashboardData> {
  const scope = workspaceScope(context);
  const now = serverNow();

  const [
    configuration,
    workspace,
    customers,
    conversations,
    calls,
    appointments,
    activityEvents,
    notifications,
    integrations,
    integrationEvents,
    workflows,
    settings,
  ] = await Promise.all([
    scope.configuration.load(),
    scope.workspace.load(periodStart(now)),
    scope.customers.list(now),
    scope.conversations.list(),
    scope.calls.list(),
    scope.appointments.list(),
    scope.activity.list(),
    scope.notifications.list(),
    scope.integrations.list(),
    scope.integrations.listEvents(),
    scope.integrations.listWorkflows(),
    scope.settings.load(context.user.id),
  ]);

  if (!configuration || !workspace) {
    throw new Error(`Workspace ${context.workspaceId} has no business profile.`);
  }

  const maySeeProviders = can(
    { platformRole: context.user.platformRole, workspaceRole: context.workspaceRole },
    "integrations.view"
  );
  const effectiveIntegrations = integrations.map((record) => effectiveIntegrationRecord(record, now));

  return {
    dataset: {
      generatedAt: now.toISOString(),
      customers,
      conversations,
      calls,
      appointments,
      activityEvents,
    },
    configuration,
    workspace,
    notifications,
    // Derived from the full records regardless of who is asking; only the
    // derived form leaves the server for a business user.
    capabilities: getCapabilityStatuses(effectiveIntegrations),
    capabilitiesCheckedAt:
      effectiveIntegrations
        .map((r) => r.lastCheckedAt)
        .filter((t): t is string => Boolean(t))
        .sort()
        .at(-1) ?? null,
    integrations: maySeeProviders ? effectiveIntegrations : [],
    integrationEvents: maySeeProviders ? integrationEvents : [],
    workflows: maySeeProviders ? workflows : [],
    settings,
    account: {
      name: context.user.name,
      email: context.user.email,
      jobTitle: context.user.jobTitle,
    },
  };
}

// ── Narrow reads, for server actions that need one thing ────────────────────
//
// Each takes an `AuthContext` for the same reason the loader does. They exist so
// a mutation does not have to pull the whole dashboard in to check one record.

export async function getWorkspaceConfiguration(context: AuthContext): Promise<AppConfiguration> {
  const configuration = await workspaceScope(context).configuration.load();
  if (!configuration) throw new Error(`Workspace ${context.workspaceId} has no business profile.`);
  return configuration;
}

export async function getWorkspaceAppointment(
  context: AuthContext,
  appointmentId: string
): Promise<Appointment | null> {
  return workspaceScope(context).appointments.findById(appointmentId);
}

export function scopeFor(context: AuthContext): WorkspaceScope {
  return workspaceScope(context);
}
