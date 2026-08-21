import { createMockAdapter } from "./core";

/** The language model behind what the receptionist says. */
export const modelProviderAdapter = createMockAdapter({
  provider: "model_provider",
  timeStyle: { kind: "utc" },
  requiredConfig: ["model", "api_key"],
  capabilitiesWhenConnected: ["chat", "summarise"],
});
