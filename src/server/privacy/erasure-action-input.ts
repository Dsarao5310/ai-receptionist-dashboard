import { z } from "zod";
import type { ErasureRejectionReason, IdentityVerificationMethod } from "./types";

const requestId = z.string().regex(/^erq_[A-Za-z0-9_-]{8,}$/);

export function parseCreateErasureRequestInput(input: unknown):
  | { ok: true; value: { callId: string; requestReference: string } }
  | { ok: false; error: string } {
  const parsed = z.object({
    callId: z.string().regex(/^call_[A-Za-z0-9_-]{3,}$/).max(100),
    requestReference: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/),
  }).strict().safeParse(input);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, error: "Enter a valid call ID and an internal reference using letters, numbers, dots, dashes, or underscores." };
}

export function parseVerifyErasureIdentityInput(input: unknown):
  | { ok: true; value: { requestId: string; method: IdentityVerificationMethod } }
  | { ok: false; error: string } {
  const parsed = z.object({
    requestId,
    method: z.enum(["callback_to_record", "matched_account_record", "in_person"]),
  }).strict().safeParse(input);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, error: "Choose a supported identity-verification method." };
}

export function parseRejectErasureRequestInput(input: unknown):
  | { ok: true; value: { requestId: string; reason: ErasureRejectionReason } }
  | { ok: false; error: string } {
  const parsed = z.object({
    requestId,
    reason: z.enum(["request_withdrawn", "identity_unverified", "not_applicable"]),
  }).strict().safeParse(input);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, error: "Choose a supported rejection reason." };
}

export function parseExecuteErasureRequestInput(input: unknown):
  | { ok: true; value: { requestId: string; confirmation: string } }
  | { ok: false; error: string } {
  const parsed = z.object({
    requestId,
    confirmation: z.string().max(120),
  }).strict().safeParse(input);
  return parsed.success
    ? { ok: true, value: parsed.data }
    : { ok: false, error: "Enter the exact confirmation shown for this request." };
}
