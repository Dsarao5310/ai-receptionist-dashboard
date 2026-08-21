import { afterEach, describe, expect, it, vi } from "vitest";
import { sendSms } from "./client";

vi.mock("server-only", () => ({}));

const ORIGINAL_MODE = process.env.TWILIO_MODE;

afterEach(() => {
  if (ORIGINAL_MODE === undefined) delete process.env.TWILIO_MODE;
  else process.env.TWILIO_MODE = ORIGINAL_MODE;
});

describe("Twilio live delivery reporting", () => {
  it("refuses a live send when no status callback can report final delivery", async () => {
    process.env.TWILIO_MODE = "live";
    const result = await sendSms({
      to: "+15550101003",
      from: "+15550101001",
      body: "Test",
      statusCallbackUrl: null,
      now: new Date("2026-08-20T20:00:00.000Z"),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("twilio_not_configured");
  });
});
