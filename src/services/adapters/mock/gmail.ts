import { createMockAdapter } from "./core";

/** Email channel. Reports timestamps as UTC ISO strings. */
export const gmailAdapter = createMockAdapter({
  provider: "gmail",
  timeStyle: { kind: "utc" },
  requiredConfig: ["mailbox", "oauth"],
  capabilitiesWhenConnected: ["read_mail", "send_mail"],
});
