import { unstable_rethrow } from "next/navigation";
import { AuthenticationError, AuthorizationError, requirePermission } from "@/server/auth/guards";
import { scopeFor } from "@/server/workspace-data";
import { serverEnv } from "@/server/env";
import { credentialStore } from "@/server/integrations/credential-store";
import { AdminDenied } from "@/features/integrations/AdminDenied";
import { WorkflowsView } from "./view";

/**
 * Workflow orchestration, for administrators.
 *
 * ── Why this page loads its own data ────────────────────────────────────────
 * The layout loads one dataset for every page, which is right for the four
 * views over the business's own records. Operation history and inbound receipts
 * are neither: they are admin diagnostics that nine users out of ten will never
 * look at, and putting them in the layout's payload would ship them to every
 * page of every session — including, before the permission gate was added, to
 * people with no right to them at all. Loading them here means they exist only
 * on the one request that asked for them.
 *
 * ── Server-side gate ────────────────────────────────────────────────────────
 * `requirePermission("workflows.view")` is platform-only and runs before any
 * query. A business owner reaching this URL gets the denial page and, more to
 * the point, a response containing nothing they were not allowed to see —
 * rendering nothing while still serialising the data would be the same leak in
 * a different place.
 */
export default async function AdminWorkflowsPage() {
  // Loaded inside the try, rendered outside it: JSX constructed within a `try`
  // makes a component's own render errors indistinguishable from the load's,
  // and would be swallowed by the authorization branch below.
  let data: Awaited<ReturnType<typeof loadWorkflowAdminData>>;
  try {
    data = await loadWorkflowAdminData();
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof AuthorizationError || error instanceof AuthenticationError) return <AdminDenied />;
    throw error;
  }

  return (
    <WorkflowsView
      workflows={data.workflows}
      operations={data.operations}
      unsettled={data.unsettled}
      receipts={data.receipts}
      engine={data.engine}
      // Configuration state, never configuration values. `describe` returns
      // whether each credential resolves; the credential itself has no path
      // from the store to this page.
      mode={data.mode}
      credentials={data.credentials}
    />
  );
}

async function loadWorkflowAdminData() {
  const context = await requirePermission("workflows.view");
  const scope = scopeFor(context);

  const [workflows, operations, unsettled, receipts, integrations] = await Promise.all([
    scope.integrations.listWorkflows(),
    scope.orchestration.listRecent(20),
    scope.orchestration.listUnsettled(20),
    scope.orchestration.listEvents(20),
    scope.integrations.list(),
  ]);

  const engine = integrations.find((r) => r.provider === "n8n");

  return {
    workflows,
    operations,
    unsettled,
    receipts,
    engine: engine
      ? {
          connection: engine.connection,
          health: engine.health,
          environment: engine.admin.environment,
          lastCheckedAt: engine.lastCheckedAt,
          lastError: engine.lastError,
        }
      : null,
    mode: serverEnv.n8nMode,
    credentials: credentialStore.describe("n8n").map((c) => ({ label: c.label, state: c.state })),
  };
}
