import "server-only";

import { serverEnv } from "@/server/env";
import { EMAIL_ERRORS, type EmailSendResult } from "./errors";
import { simulatedEmail } from "./simulator";

export interface SendEmailInput {
  from: string;
  to: string;
  subject: string;
  body: string;
  replyToThreadId?: string | null;
  now: Date;
}

/**
 * One named email side effect. Live Gmail is intentionally fail closed until
 * OAuth, scopes, and mailbox-watch lifecycle are implemented separately.
 */
export async function sendEmail(input: SendEmailInput): Promise<EmailSendResult> {
  if (serverEnv.emailProviderMode === "simulated") return simulatedEmail.send(input);
  return { ok: false, error: EMAIL_ERRORS.notConfigured(input.now) };
}
