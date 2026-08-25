import "server-only";

import { EMAIL_ERRORS, type EmailSendResult } from "./errors";

interface SimulatedEmail {
  messageId: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  status: "accepted";
}

const messages = new Map<string, SimulatedEmail>();
let sequence = 0;

export const SIMULATED_EMAIL = {
  timeout: "timeout@simulator.invalid",
  rateLimited: "rate-limited@simulator.invalid",
  rejected: "rejected@simulator.invalid",
} as const;

export const simulatedEmail = {
  async send(input: {
    from: string;
    to: string;
    subject: string;
    body: string;
    replyToThreadId?: string | null;
    now: Date;
  }): Promise<EmailSendResult> {
    if (input.to === SIMULATED_EMAIL.timeout) return { ok: false, error: EMAIL_ERRORS.timeout(input.now) };
    if (input.to === SIMULATED_EMAIL.rateLimited) {
      return { ok: false, error: EMAIL_ERRORS.rateLimited(input.now) };
    }
    if (input.to === SIMULATED_EMAIL.rejected) return { ok: false, error: EMAIL_ERRORS.rejected(input.now) };

    sequence += 1;
    const messageId = `gmail_sim_message_${sequence}`;
    const threadId = input.replyToThreadId ?? `gmail_sim_thread_${sequence}`;
    messages.set(messageId, {
      messageId,
      threadId,
      from: input.from,
      to: input.to,
      subject: input.subject,
      body: input.body,
      status: "accepted",
    });
    return { ok: true, value: { messageId, threadId, status: "accepted" } };
  },

  reset(): void {
    messages.clear();
    sequence = 0;
  },

  all(): SimulatedEmail[] {
    return [...messages.values()];
  },
};
