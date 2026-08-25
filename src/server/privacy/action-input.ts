import { z } from "zod";
import type { PrivacyPolicyPatch } from "@/server/db/repositories/call-privacy";

const privacyPolicySchema = z.object({
  recordingMode: z.enum(["disabled", "explicit_consent"]),
  transcriptRetentionDays: z.number().int().min(1).max(365),
  recordingRetentionDays: z.number().int().min(1).max(90),
  consentNotice: z.string().max(1000),
}).superRefine((value, context) => {
  if (value.recordingMode === "explicit_consent" && value.consentNotice.trim().length < 20) {
    context.addIssue({
      code: "custom",
      path: ["consentNotice"],
      message: "Consent notice must contain at least 20 characters when recording is enabled.",
    });
  }
});

export function parsePrivacyPolicyActionInput(input: unknown):
  | { ok: true; value: PrivacyPolicyPatch }
  | { ok: false; error: string } {
  const parsed = privacyPolicySchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the privacy policy values." };
  }
  return { ok: true, value: { ...parsed.data, consentNotice: parsed.data.consentNotice.trim() } };
}
