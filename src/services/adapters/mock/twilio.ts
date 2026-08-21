import { createMockAdapter } from "./core";

/**
 * SMS and telephony. Sends timestamps with an explicit UTC offset, which is the
 * more specific statement and is taken at face value by the boundary.
 */
export const twilioAdapter = createMockAdapter({
  provider: "twilio",
  timeStyle: { kind: "offset", offsetMinutes: 0 },
  requiredConfig: ["phone_number", "auth_token"],
  capabilitiesWhenConnected: ["inbound_sms", "outbound_sms"],
});
