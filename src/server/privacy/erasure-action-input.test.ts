import { describe, expect, it } from "vitest";
import {
  parseCreateErasureRequestInput,
  parseExecuteErasureRequestInput,
  parseRejectErasureRequestInput,
  parseVerifyErasureIdentityInput,
} from "./erasure-action-input";

describe("erasure request action input", () => {
  it("accepts only a call id and constrained internal reference", () => {
    expect(parseCreateErasureRequestInput({
      callId: "call_abcdefgh",
      requestReference: "  CASE-2026_001  ",
    })).toEqual({
      ok: true,
      value: { callId: "call_abcdefgh", requestReference: "CASE-2026_001" },
    });
    expect(parseCreateErasureRequestInput({
      callId: "call_abcdefgh",
      requestReference: "requester@example.com",
    }).ok).toBe(false);
  });

  it("rejects unknown fields rather than silently accepting sensitive notes", () => {
    expect(parseCreateErasureRequestInput({
      callId: "call_abcdefgh",
      requestReference: "CASE-2026-001",
      requesterEmail: "requester@example.com",
    }).ok).toBe(false);
  });

  it("constrains identity and rejection vocabularies", () => {
    expect(parseVerifyErasureIdentityInput({
      requestId: "erq_abcdefgh",
      method: "callback_to_record",
    }).ok).toBe(true);
    expect(parseVerifyErasureIdentityInput({
      requestId: "erq_abcdefgh",
      method: "looked_plausible",
    }).ok).toBe(false);
    expect(parseRejectErasureRequestInput({
      requestId: "erq_abcdefgh",
      reason: "identity_unverified",
    }).ok).toBe(true);
    expect(parseRejectErasureRequestInput({
      requestId: "erq_abcdefgh",
      reason: "free text",
    }).ok).toBe(false);
  });

  it("bounds confirmation input while leaving exact matching to the service", () => {
    expect(parseExecuteErasureRequestInput({
      requestId: "erq_abcdefgh",
      confirmation: "ERASE erq_abcdefgh",
    }).ok).toBe(true);
    expect(parseExecuteErasureRequestInput({
      requestId: "erq_abcdefgh",
      confirmation: "x".repeat(121),
    }).ok).toBe(false);
  });
});
