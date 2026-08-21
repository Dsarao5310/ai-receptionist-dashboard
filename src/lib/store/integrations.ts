"use client";

/**
 * Provider integration state.
 *
 * The adapters now run behind the server boundary — see
 * `server/actions/integrations.ts`. Nothing in this module reaches a provider,
 * and no component imports an adapter.
 */
export {
  useIntegrations,
  useWorkspaceIntegrations,
  type IntegrationsState,
} from "./workspace-stores";

import type { IntegrationRecord, ProviderId } from "@/types";

export function providerOf(record: IntegrationRecord): ProviderId {
  return record.provider;
}
