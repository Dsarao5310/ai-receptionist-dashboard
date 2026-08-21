"use server";

import { revalidatePath } from "next/cache";
import type { IntegrationRecord, TestResult } from "@/types";
import { AuthenticationError, AuthorizationError, requirePermission } from "@/server/auth/guards";
import { recordAuditEvent } from "@/server/audit";
import { serverNow } from "@/server/clock";
import { scopeFor } from "@/server/workspace-data";
import { getServerAdapter } from "@/server/integrations/registry";

/**
 * Provider operations, behind the server boundary.
 *
 * ── Why the adapters moved ──────────────────────────────────────────────────
 * Connect, test and disconnect used to run in the browser: a client store
 * imported the adapter, called it, and wrote the result to local storage. That
 * was fine while the adapters were mocks and could only pretend. It stops being
 * fine the moment one of them is real, because a real adapter needs a
 * credential, and a credential in a browser bundle is a published credential.
 *
 * So the shape is fixed now, while it is still cheap:
 *
 *     browser → server action → require platform permission → adapter
 *             → integration repository → Postgres
 *
 * No React component imports an adapter. When the mocks are replaced by Vapi and
 * Twilio, nothing above this file changes and no secret has anywhere to leak to.
 *
 * ── Why these need platform privilege ───────────────────────────────────────
 * `integrations.manage` is platform-only. A business owner has complete
 * authority over their business and none over the infrastructure behind it —
 * they see capabilities ("Voice is connected"), never providers. That is
 * enforced here, not by hiding the navigation.
 */

export type IntegrationResult =
  | { ok: true; record: IntegrationRecord }
  | { ok: false; error: string };

export type TestConnectionResult =
  | { ok: true; record: IntegrationRecord; result: TestResult }
  | { ok: false; error: string };

function toFailure(error: unknown): { ok: false; error: string } {
  if (error instanceof AuthorizationError || error instanceof AuthenticationError) {
    return { ok: false, error: error.publicMessage };
  }
  throw error;
}

function revalidateWorkspaceViews(): void {
  revalidatePath("/", "layout");
}

export async function connectIntegrationAction(integrationId: string): Promise<IntegrationResult> {
  try {
    const context = await requirePermission("integrations.manage");
    const scope = scopeFor(context);

    const record = await scope.integrations.findById(integrationId);
    if (!record) return { ok: false, error: "Integration not found." };

    const now = serverNow();
    const patch = await getServerAdapter(record.provider).connect({ record, now });
    const updated = await scope.integrations.applyPatch(integrationId, patch);
    if (!updated) return { ok: false, error: "Integration not found." };

    const connected = patch.connection === "connected" && patch.health === "healthy" && !patch.lastError;
    if (!connected) {
      await scope.integrations.recordEvent({
        provider: record.provider,
        type: "test_failed",
        message: `Connection failed for ${record.displayName}: ${patch.lastError?.message ?? "Provider unavailable."}`,
        severity: patch.lastError?.severity ?? "warning",
        occurredAt: patch.lastCheckedAt ? new Date(patch.lastCheckedAt) : now,
      });
      await recordAuditEvent({
        actorUserId: context.user.id,
        workspaceId: context.workspaceId,
        action: "integration.tested",
        targetType: "integration",
        targetId: record.provider,
        metadata: { outcome: "connection_failed" },
      });
      revalidateWorkspaceViews();
      return { ok: false, error: patch.lastError?.message ?? "The provider could not be connected." };
    }

    await scope.integrations.recordEvent({
      provider: record.provider,
      type: "connected",
      message: `${record.displayName} was connected.`,
      severity: "info",
      occurredAt: patch.lastCheckedAt ? new Date(patch.lastCheckedAt) : now,
    });

    await recordAuditEvent({
      actorUserId: context.user.id,
      workspaceId: context.workspaceId,
      action: "integration.connected",
      targetType: "integration",
      targetId: record.provider,
    });

    revalidateWorkspaceViews();
    return { ok: true, record: updated };
  } catch (error) {
    return toFailure(error);
  }
}

export async function disconnectIntegrationAction(integrationId: string): Promise<IntegrationResult> {
  try {
    const context = await requirePermission("integrations.manage");
    const scope = scopeFor(context);

    const record = await scope.integrations.findById(integrationId);
    if (!record) return { ok: false, error: "Integration not found." };

    const now = serverNow();
    const patch = await getServerAdapter(record.provider).disconnect({ record, now });
    const updated = await scope.integrations.applyPatch(integrationId, patch);
    if (!updated) return { ok: false, error: "Integration not found." };

    await scope.integrations.recordEvent({
      provider: record.provider,
      type: "disconnected",
      message: `${record.displayName} was disconnected.`,
      severity: "warning",
      occurredAt: patch.lastCheckedAt ? new Date(patch.lastCheckedAt) : now,
    });

    await recordAuditEvent({
      actorUserId: context.user.id,
      workspaceId: context.workspaceId,
      action: "integration.disconnected",
      targetType: "integration",
      targetId: record.provider,
    });

    revalidateWorkspaceViews();
    return { ok: true, record: updated };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Run a connection check and record what it found.
 *
 * A failed check on a live connection moves it to "needs attention" rather than
 * leaving it claiming to be connected and fine — the status the business owner
 * sees is derived from this, so a check that failed quietly would be a status
 * that lies.
 */
export async function testIntegrationAction(integrationId: string): Promise<TestConnectionResult> {
  try {
    const context = await requirePermission("integrations.manage");
    const scope = scopeFor(context);

    const record = await scope.integrations.findById(integrationId);
    if (!record) return { ok: false, error: "Integration not found." };

    const now = serverNow();
    const result = await getServerAdapter(record.provider).testConnection({ record, now });
    const checkedAt = result.error?.timestamp ?? now.toISOString();
    const passed = result.outcome === "healthy";
    const recovered = passed && record.health !== "healthy";

    const updated = await scope.integrations.applyPatch(integrationId, {
      health: result.health,
      lastCheckedAt: checkedAt,
      lastSuccessfulSyncAt: passed ? checkedAt : record.lastSuccessfulSyncAt,
      lastError: result.error ?? null,
      connection: passed
        ? record.connection === "needs_attention" || record.connection === "error"
          ? "connected"
          : record.connection
        : record.connection === "connected"
          ? "needs_attention"
          : record.connection,
    });
    if (!updated) return { ok: false, error: "Integration not found." };

    await scope.integrations.recordEvent({
      provider: record.provider,
      type: recovered ? "recovered" : passed ? "test_passed" : "test_failed",
      message: passed
        ? `Connection test passed for ${record.displayName}.`
        : `Connection test failed for ${record.displayName}: ${result.message}`,
      severity: passed ? "info" : (result.error?.severity ?? "warning"),
      occurredAt: new Date(checkedAt),
    });

    await recordAuditEvent({
      actorUserId: context.user.id,
      workspaceId: context.workspaceId,
      action: "integration.tested",
      targetType: "integration",
      targetId: record.provider,
      metadata: { outcome: result.outcome },
    });

    revalidateWorkspaceViews();
    return { ok: true, record: updated, result };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Workspace administration ────────────────────────────────────────────────

export async function setWorkspaceNotesAction(notes: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const context = await requirePermission("clients.manage");
    await scopeFor(context).workspace.setInternalNotes(notes);
    revalidateWorkspaceViews();
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

export async function setFeatureFlagAction(
  flag: string,
  enabled: boolean
): Promise<{ ok: boolean; error?: string }> {
  try {
    const context = await requirePermission("clients.manage");
    await scopeFor(context).workspace.setFeatureFlag(flag, enabled);
    await recordAuditEvent({
      actorUserId: context.user.id,
      workspaceId: context.workspaceId,
      action: "workspace.settings_changed",
      targetType: "feature_flag",
      targetId: flag,
      metadata: { enabled },
    });
    revalidateWorkspaceViews();
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}
