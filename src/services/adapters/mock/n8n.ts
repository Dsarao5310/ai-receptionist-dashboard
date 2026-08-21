import { createMockAdapter } from "./core";

/**
 * Automation engine. Every other capability's workflows run here, so its health
 * degrades the channels that depend on it — see services/integrations.ts.
 */
export const n8nAdapter = createMockAdapter({
  provider: "n8n",
  timeStyle: { kind: "offset", offsetMinutes: -480 },
  requiredConfig: ["instance", "credential"],
  capabilitiesWhenConnected: ["execute", "history"],
});
