import { createMockAdapter } from "./core";

/** Voice AI infrastructure. Reports timestamps as UTC ISO strings. */
export const vapiAdapter = createMockAdapter({
  provider: "vapi",
  timeStyle: { kind: "utc" },
  requiredConfig: ["assistant", "phone_number", "api_key"],
  capabilitiesWhenConnected: ["inbound_calls", "transcription"],
});
