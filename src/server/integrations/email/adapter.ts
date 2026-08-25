import "server-only";

import type { IntegrationCapabilityFlag } from "@/types";
import { requireWorkspace } from "@/server/auth/guards";
import { workspaceScope } from "@/server/db/workspace-scope";
import { serverEnv } from "@/server/env";
import type { AdapterContext, IntegrationAdapter, TestResult } from "@/services/adapters/types";
import { EMAIL_ERRORS } from "./errors";

function capabilitiesFor(ctx: AdapterContext, enabled: boolean): IntegrationCapabilityFlag[] {
  return ctx.record.capabilities.map((capability) =>
    ["read_mail", "send_mail"].includes(capability.key)
      ? { ...capability, enabled }
      : capability
  );
}

async function usableMailboxExists(): Promise<boolean> {
  const context = await requireWorkspace();
  const mailboxes = await workspaceScope(context).email.listMailboxes();
  return mailboxes.some((mailbox) => mailbox.active && mailbox.inboundEnabled && mailbox.outboundEnabled);
}

export const emailServerAdapter: IntegrationAdapter = {
  provider: "gmail",

  async connect(ctx) {
    if (serverEnv.emailProviderMode !== "simulated" || !(await usableMailboxExists())) {
      return {
        connection: "not_configured",
        health: "unknown",
        lastCheckedAt: ctx.now.toISOString(),
        lastError: EMAIL_ERRORS.notConfigured(ctx.now),
        capabilities: capabilitiesFor(ctx, false),
      };
    }
    return {
      connection: "connected",
      health: "healthy",
      lastCheckedAt: ctx.now.toISOString(),
      lastError: null,
      capabilities: capabilitiesFor(ctx, true),
    };
  },

  async disconnect(ctx) {
    return {
      connection: "disconnected",
      health: "unknown",
      lastCheckedAt: ctx.now.toISOString(),
      lastError: null,
      capabilities: capabilitiesFor(ctx, false),
    };
  },

  async testConnection(ctx): Promise<TestResult> {
    if (serverEnv.emailProviderMode !== "simulated" || !(await usableMailboxExists())) {
      return {
        outcome: "configuration_incomplete",
        health: "unknown",
        message: "Email is not set up yet.",
        error: EMAIL_ERRORS.notConfigured(ctx.now),
      };
    }
    return {
      outcome: "healthy",
      health: "healthy",
      message: "Ready to receive and send email (simulated).",
      error: null,
    };
  },

  getCapabilities(ctx) {
    return capabilitiesFor(
      ctx,
      ctx.record.connection === "connected" &&
        ctx.record.admin.environment === "sandbox" &&
        serverEnv.emailProviderMode === "simulated"
    );
  },
};
