import "server-only";

import type { IntegrationRecord, ProviderId } from "@/types";
import type { IntegrationAdapter } from "@/services/adapters";
import { n8nServerAdapter } from "./n8n/adapter";
import { googleCalendarServerAdapter } from "./google-calendar/adapter";
import { twilioServerAdapter } from "./twilio/adapter";
import { unavailableServerAdapter } from "./unavailable-adapter";

/**
 * Adapter resolution, on the server.
 *
 * ── Why a second registry rather than editing the first ─────────────────────
 * `services/adapters/index.ts` is ordinary shared code: nothing stops a
 * component importing it, and the type `TestResult` is imported by a client
 * store today. Putting a `server-only` adapter into that map would make the map
 * itself server-only by transitivity, and the first client import would fail the
 * build with an error about a module nobody meant to import.
 *
 * So the seam is here instead. This module is `server-only`, so it can hold
 * adapters that open sockets and resolve credentials, and the failure mode for
 * importing it from a component is immediate and obvious rather than subtle.
 * Server code calls `getServerAdapter`; everything else keeps the mocks.
 *
 * As each remaining provider becomes real, it is added to this map. The rest of
 * the application does not change, which is what the adapter interface was for.
 */
const SERVER_ADAPTERS: Partial<Record<ProviderId, IntegrationAdapter>> = {
  n8n: n8nServerAdapter,
  google_calendar: googleCalendarServerAdapter,
  twilio: twilioServerAdapter,
};

export function getServerAdapter(provider: ProviderId): IntegrationAdapter {
  return SERVER_ADAPTERS[provider] ?? unavailableServerAdapter(provider);
}

/** Which providers are backed by a real implementation. Admin diagnostics only. */
export function isLiveProvider(provider: ProviderId): boolean {
  return provider in SERVER_ADAPTERS;
}

/**
 * Project durable state through the adapter available in this server process.
 * Seed and history rows must not make an unavailable or disabled provider look
 * operational in a page payload.
 */
export function effectiveIntegrationRecord(record: IntegrationRecord, now: Date): IntegrationRecord {
  const capabilities = getServerAdapter(record.provider).getCapabilities({ record, now });

  if (record.connection === "connected" && !capabilities.some((capability) => capability.enabled)) {
    return { ...record, connection: "not_configured", health: "unknown", capabilities };
  }

  return { ...record, capabilities };
}
