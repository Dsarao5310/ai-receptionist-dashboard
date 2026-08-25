import { describe, expect, it } from "vitest";
import { parsePrivacyPolicyActionInput } from "./action-input";

describe("privacy policy action input", () => {
  it("accepts valid values and trims the consent notice", () => {
    expect(parsePrivacyPolicyActionInput({
      recordingMode: "explicit_consent",
      transcriptRetentionDays: 90,
      recordingRetentionDays: 30,
      consentNotice: "  This call may be recorded after you explicitly agree.  ",
    })).toEqual({
      ok: true,
      value: {
        recordingMode: "explicit_consent",
        transcriptRetentionDays: 90,
        recordingRetentionDays: 30,
        consentNotice: "This call may be recorded after you explicitly agree.",
      },
    });
  });

  it("rejects unknown modes and out-of-range retention", () => {
    expect(parsePrivacyPolicyActionInput({
      recordingMode: "always",
      transcriptRetentionDays: 0,
      recordingRetentionDays: 91,
      consentNotice: "",
    }).ok).toBe(false);
  });

  it("requires a meaningful notice for explicit consent", () => {
    const result = parsePrivacyPolicyActionInput({
      recordingMode: "explicit_consent",
      transcriptRetentionDays: 30,
      recordingRetentionDays: 7,
      consentNotice: "Too short",
    });
    expect(result).toEqual({
      ok: false,
      error: "Consent notice must contain at least 20 characters when recording is enabled.",
    });
  });

  it("does not require notice text while recording is disabled", () => {
    expect(parsePrivacyPolicyActionInput({
      recordingMode: "disabled",
      transcriptRetentionDays: 365,
      recordingRetentionDays: 90,
      consentNotice: "",
    }).ok).toBe(true);
  });
});
