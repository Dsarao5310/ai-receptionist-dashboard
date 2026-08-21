import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/types/identity";
import { DEV_WORKSPACE_A, DEV_WORKSPACE_B } from "@/data/workspace-ids";
import { authorizeWorkspace, type AuthContext } from "@/server/auth/policy";
import { PostgresIdentityRepository } from "@/server/db/identity";
import { workspaceScope } from "@/server/db/workspace-scope";
import type { Sql } from "@/server/db/client";
import { loadWorkspaceDashboard } from "@/server/workspace-data";
import { credentialStore, Secret } from "@/server/integrations/credential-store";
import { hasDatabase, resetTestDatabase, testDb, testMigratorDb } from "@/test/database";
import { ingestDeliveryStatus, ingestInboundMessage } from "./inbound";
import { requestOutboundMessage } from "./messaging";
import { computeSignature } from "./signing";
import { toE164, formatForDisplay } from "./phone-numbers";
import { simulatedTwilio, SIMULATED } from "./simulator";

/**
 * Twilio, proven against Postgres, two tenants and a deterministic carrier.
 *
 * ── What is real here and what is not ───────────────────────────────────────
 * The application code is the production code: the same signature verification,
 * the same inbound pipeline, the same idempotency spine, the same database,
 * the same tenant resolution. What is substituted is the carrier —
 * `TWILIO_MODE=simulated` runs an in-process Twilio with the same semantics
 * rather than issuing HTTPS calls.
 *
 * That substitution is stated plainly in the report: **no test in this suite
 * contacts a real Twilio account, and nothing here sends a real message.** The
 * parts a simulator cannot vouch for — that Twilio accepts our exact form
 * encoding, that a real `X-Twilio-Signature` verifies, that a real handset
 * receives anything — are what live certification is for, and are the parts
 * this suite does not claim.
 */

vi.mock("server-only", () => ({}));

const NOW = new Date("2026-08-17T20:00:00.000Z");

const OUR_NUMBER = "+17372212163";
const OTHER_NUMBER = "+17372219999";
const CUSTOMER = "+16045617029";

const WEBHOOK_URL = "https://example.test/api/internal/twilio/sms";
const STATUS_URL = "https://example.test/api/internal/twilio/status";

let sql: Sql;
let repo: PostgresIdentityRepository;

const describeDb = hasDatabase ? describe : describe.skip;

beforeAll(async () => {
  if (!hasDatabase) return;
  process.env.N8N_MODE = "simulated";
  process.env.TWILIO_MODE = "simulated";
  process.env.TWILIO_AUTH_TOKEN = "test-twilio-auth-token";
  process.env.TWILIO_PUBLIC_WEBHOOK_URL = WEBHOOK_URL;
  process.env.TWILIO_STATUS_CALLBACK_URL = STATUS_URL;

  await resetTestDatabase(NOW);
  sql = testDb();
  repo = new PostgresIdentityRepository(sql);
}, 180_000);

afterAll(async () => {
  if (hasDatabase) {
    // Leave the fixture as it was found: the seeded mapping is part of the
    // shared schema other suites read.
    await remapMessaging(DEV_WORKSPACE_A);
    await remapMessaging(DEV_WORKSPACE_B);
  }
  await sql?.end({ timeout: 5 });
});

beforeEach(async () => {
  if (!hasDatabase) return;
  simulatedTwilio.reset();
  // Numbers and messages are the state these tests build; clear them so each
  // test starts from the mapping it establishes itself.
  await sql`delete from sms_messages`;
  await sql`delete from provider_phone_numbers`;
  await sql`delete from integration_inbound_events where source = 'twilio'`;
  await sql`delete from integration_operations where operation = 'customer.message'`;
  await unmapMessaging(DEV_WORKSPACE_A);
  await unmapMessaging(DEV_WORKSPACE_B);
});

async function userByEmail(email: string): Promise<User> {
  const user = await repo.findUserByEmail(email);
  if (!user) throw new Error(`fixture missing: ${email}`);
  return user;
}

const alex = () => userByEmail("alex@coastalbloom.example");
const priya = () => userByEmail("priya@harbourdental.example");

async function contextFor(user: User, workspaceId: string): Promise<AuthContext> {
  return authorizeWorkspace(user, workspaceId, repo);
}

/** Give a workspace a number, the way an operator provisioning one would. */
async function claimNumber(context: AuthContext, phoneNumber: string): Promise<void> {
  await workspaceScope(context, sql).messaging.claimNumber({
    provider: "twilio",
    phoneNumber,
    label: "Test line",
  });
}

/**
 * Let the Twilio adapter be the thing that runs.
 *
 * The seed maps `customer.message` to an n8n workflow, and a mapped workflow
 * *wins* — that precedence is the product's rule and is deliberately not
 * weakened for tests. So a suite exercising the direct carrier path unmaps the
 * operation first, exactly as the calendar suite does, and puts it back
 * afterwards. A test that skipped this would silently prove n8n works.
 */
async function unmapMessaging(workspaceId: string): Promise<void> {
  await sql`
    update workflow_mappings set operation = null
    where workspace_id = ${workspaceId} and operation = 'customer.message'`;
}

async function remapMessaging(workspaceId: string): Promise<void> {
  await sql`
    update workflow_mappings set operation = 'customer.message'
    where workspace_id = ${workspaceId} and id like '%__wf_sms'`;
}

/** A correctly signed Twilio webhook, built the way Twilio builds one. */
function signed(url: string, fields: Record<string, string>) {
  const params = new URLSearchParams(fields);
  const token = credentialStore.resolve("twilio", "auth_token");
  if (!token) throw new Error("test requires TWILIO_AUTH_TOKEN");
  return {
    rawBody: params.toString(),
    signature: computeSignature(url, params, token),
    now: NOW,
  };
}

const inboundFields = (over: Record<string, string> = {}) => ({
  MessageSid: "SM_inbound_1",
  From: CUSTOMER,
  To: OUR_NUMBER,
  Body: "Can I move my appointment?",
  ...over,
});

const statusFields = (over: Record<string, string> = {}) => ({
  MessageSid: "SM_out_1",
  From: OUR_NUMBER,
  To: CUSTOMER,
  MessageStatus: "delivered",
  ...over,
});

// ── Phone number normalization ──────────────────────────────────────────────

describe("phone numbers are canonicalized before they are used as keys", () => {
  it("accepts the shapes a real system produces", () => {
    expect(toE164("+17372212163")).toBe("+17372212163");
    expect(toE164("+1 (737) 221-2163")).toBe("+17372212163");
    expect(toE164("0017372212163")).toBe("+17372212163");
    expect(toE164("7372212163", "1")).toBe("+17372212163");
    expect(toE164("17372212163", "1")).toBe("+17372212163");
  });

  it("refuses to guess a country rather than inventing one", () => {
    // A bare national number with no stated country is ambiguous, and guessing
    // North America is how a UK number silently becomes a US one.
    expect(toE164("7372212163")).toBeNull();
    expect(toE164("")).toBeNull();
    expect(toE164("not a number")).toBeNull();
    expect(toE164("+0123")).toBeNull();
  });

  it("formats for display without ever changing the stored form", () => {
    expect(formatForDisplay("+17372212163")).toBe("+1 (737) 221-2163");
    // An unfamiliar country is left in E.164 rather than grouped by guesswork.
    expect(formatForDisplay("+442071838750")).toBe("+442071838750");
  });
});

// ── Signature verification ──────────────────────────────────────────────────

describeDb("inbound requests must carry a valid Twilio signature", () => {
  it("accepts a correctly signed request", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await claimNumber(context, OUR_NUMBER);

    const outcome = await ingestInboundMessage(signed(WEBHOOK_URL, inboundFields()));
    expect(outcome.status).toBe("accepted");
  });

  it("refuses an unsigned request", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await claimNumber(context, OUR_NUMBER);

    const request = signed(WEBHOOK_URL, inboundFields());
    const outcome = await ingestInboundMessage({ ...request, signature: null });
    expect(outcome).toEqual({ status: "unauthorized" });
  });

  it("refuses a body altered after it was signed", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await claimNumber(context, OUR_NUMBER);

    const request = signed(WEBHOOK_URL, inboundFields());
    const tampered = request.rawBody.replace("Can+I+move", "Cancel+everything");
    expect(tampered).not.toBe(request.rawBody);

    const outcome = await ingestInboundMessage({ ...request, rawBody: tampered });
    expect(outcome).toEqual({ status: "unauthorized" });
  });

  it("refuses a signature computed for a different URL", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await claimNumber(context, OUR_NUMBER);

    // Twilio signs the URL as well as the parameters. A signature minted for
    // the status endpoint must not open the message endpoint.
    const outcome = await ingestInboundMessage(signed(STATUS_URL, inboundFields()));
    expect(outcome).toEqual({ status: "unauthorized" });
  });

  it("tells an unauthenticated caller nothing beyond 'unauthorized'", async () => {
    const request = signed(WEBHOOK_URL, inboundFields());
    const outcome = await ingestInboundMessage({ ...request, signature: "not-a-signature" });
    // No reason, no hint whether the number was even recognised.
    expect(outcome).toEqual({ status: "unauthorized" });
    expect(Object.keys(outcome)).toEqual(["status"]);
  });

  it("refuses everything when no auth token is configured", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await claimNumber(context, OUR_NUMBER);

    const request = signed(WEBHOOK_URL, inboundFields());
    const saved = process.env.TWILIO_AUTH_TOKEN;
    try {
      delete process.env.TWILIO_AUTH_TOKEN;
      // "We are not configured" must never be treated as "the caller is fine";
      // that is what turns a webhook into an open write endpoint.
      expect(await ingestInboundMessage(request)).toEqual({ status: "unauthorized" });
    } finally {
      process.env.TWILIO_AUTH_TOKEN = saved;
    }
  });
});

// ── Trusted tenant resolution ───────────────────────────────────────────────

describeDb("the workspace comes from a mapping we issued, never from the payload", () => {
  it("attributes a message by the number it was sent to", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await claimNumber(context, OUR_NUMBER);

    await ingestInboundMessage(signed(WEBHOOK_URL, inboundFields()));

    const messages = await workspaceScope(context, sql).messaging.listMessages();
    expect(messages).toHaveLength(1);
    expect(messages[0].workspaceId).toBe(DEV_WORKSPACE_A);
    expect(messages[0].direction).toBe("inbound");
  });

  it("refuses a message to a number no workspace has claimed", async () => {
    const outcome = await ingestInboundMessage(signed(WEBHOOK_URL, inboundFields()));
    expect(outcome).toEqual({ status: "rejected", reason: "unrecognised destination number" });
  });

  it("ignores a workspace id smuggled into the payload", async () => {
    const contextA = await contextFor(await alex(), DEV_WORKSPACE_A);
    await claimNumber(contextA, OUR_NUMBER);

    // Correctly signed, and naming another tenant in the body. The body is not
    // consulted for tenancy, so the claim has no effect at all.
    await ingestInboundMessage(
      signed(WEBHOOK_URL, inboundFields({ workspaceId: DEV_WORKSPACE_B, WorkspaceSid: DEV_WORKSPACE_B }))
    );

    const contextB = await contextFor(await priya(), DEV_WORKSPACE_B);
    expect(await workspaceScope(contextB, sql).messaging.listMessages()).toHaveLength(0);
    expect(await workspaceScope(contextA, sql).messaging.listMessages()).toHaveLength(1);
  });

  it("keeps two tenants' numbers apart", async () => {
    const contextA = await contextFor(await alex(), DEV_WORKSPACE_A);
    const contextB = await contextFor(await priya(), DEV_WORKSPACE_B);
    await claimNumber(contextA, OUR_NUMBER);
    await claimNumber(contextB, OTHER_NUMBER);

    await ingestInboundMessage(signed(WEBHOOK_URL, inboundFields({ To: OTHER_NUMBER })));

    // The message went to B's number, so only B sees it.
    expect(await workspaceScope(contextA, sql).messaging.listMessages()).toHaveLength(0);
    expect(await workspaceScope(contextB, sql).messaging.listMessages()).toHaveLength(1);
  });

  it("will not let two workspaces claim one number", async () => {
    const contextA = await contextFor(await alex(), DEV_WORKSPACE_A);
    const contextB = await contextFor(await priya(), DEV_WORKSPACE_B);
    await claimNumber(contextA, OUR_NUMBER);

    // The database decides, not application code: repointing a live number at
    // another tenant would redirect every future message for it.
    await expect(claimNumber(contextB, OUR_NUMBER)).rejects.toThrow();
  });
});

// ── Inbound idempotency ─────────────────────────────────────────────────────

describeDb("a redelivered inbound message is applied exactly once", () => {
  it("answers a repeat delivery as a duplicate", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await claimNumber(context, OUR_NUMBER);

    const request = signed(WEBHOOK_URL, inboundFields());
    const first = await ingestInboundMessage(request);
    const second = await ingestInboundMessage(request);

    expect(first.status).toBe("accepted");
    expect(second.status).toBe("duplicate");
    expect(await workspaceScope(context, sql).messaging.listMessages()).toHaveLength(1);
  });

  it("lets the database arbitrate concurrent deliveries", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await claimNumber(context, OUR_NUMBER);

    const request = signed(WEBHOOK_URL, inboundFields({ MessageSid: "SM_race" }));
    const outcomes = await Promise.all([
      ingestInboundMessage(request),
      ingestInboundMessage(request),
      ingestInboundMessage(request),
    ]);

    expect(outcomes.filter((o) => o.status === "accepted")).toHaveLength(1);
    expect(await workspaceScope(context, sql).messaging.listMessages()).toHaveLength(1);
  });
});

// ── Outbound ────────────────────────────────────────────────────────────────

describeDb("sending a message", () => {
  it("hands exactly one message to the carrier and records it as sent, not delivered", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await claimNumber(context, OUR_NUMBER);

    const disposition = await requestOutboundMessage(context, {
      to: CUSTOMER,
      body: "Your appointment is confirmed.",
      now: NOW,
    });

    expect(disposition.kind).toBe("succeeded");
    expect(simulatedTwilio.all()).toHaveLength(1);

    const [message] = await workspaceScope(context, sql).messaging.listMessages();
    // The carrier accepted it. That is not delivery, and the record says so.
    expect(message.direction).toBe("outbound");
    expect(message.status).toBe("queued");
    expect(message.deliveredAt).toBeNull();
    expect(message.providerMessageSid).toBeTruthy();
  });

  it("produces one message however many times the same request arrives", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await claimNumber(context, OUR_NUMBER);
    const input = { to: CUSTOMER, body: "Running ten minutes late.", now: NOW };

    const first = await requestOutboundMessage(context, input);
    const second = await requestOutboundMessage(context, input);
    const third = await requestOutboundMessage(context, input);

    expect(first.kind).toBe("succeeded");
    expect(second.kind).toBe("duplicate");
    expect(third.kind).toBe("duplicate");
    // The retries never reached the carrier: one message, not three.
    expect(simulatedTwilio.all()).toHaveLength(1);
  });

  it("treats a different message to the same person as a different operation", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await claimNumber(context, OUR_NUMBER);

    await requestOutboundMessage(context, { to: CUSTOMER, body: "First.", now: NOW });
    const second = await requestOutboundMessage(context, { to: CUSTOMER, body: "Second.", now: NOW });

    expect(second.kind).toBe("succeeded");
    expect(simulatedTwilio.all()).toHaveLength(2);
  });

  it("refuses a destination it cannot canonicalize, without contacting the carrier", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await claimNumber(context, OUR_NUMBER);

    const disposition = await requestOutboundMessage(context, {
      to: "not a phone number",
      body: "Hello?",
      now: NOW,
    });

    expect(disposition.kind).toBe("failed");
    expect(simulatedTwilio.all()).toHaveLength(0);
  });

  it("normalizes provider refusals into safe, business-readable errors", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await claimNumber(context, OUR_NUMBER);

    const unverified = await requestOutboundMessage(context, {
      to: SIMULATED.unverified,
      body: "Trial account test.",
      now: NOW,
    });

    expect(unverified.kind).toBe("failed");
    if (unverified.kind !== "failed") return;
    expect(unverified.error.code).toBe("twilio_unverified_recipient");
    // The number is an operator's detail; the business user gets plain English.
    expect(unverified.error.message).not.toMatch(/21608/);
    expect(unverified.error.adminDetail).toMatch(/21608/);
    expect(unverified.error.retryable).toBe(false);
  });

  it("classifies a timeout as retryable and a bad number as not", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await claimNumber(context, OUR_NUMBER);

    const timedOut = await requestOutboundMessage(context, {
      to: SIMULATED.timeout,
      body: "…",
      now: NOW,
    });
    const invalid = await requestOutboundMessage(context, {
      to: SIMULATED.invalid,
      body: "…",
      now: NOW,
    });

    expect(timedOut.kind === "failed" && timedOut.error.retryable).toBe(true);
    expect(invalid.kind === "failed" && invalid.error.retryable).toBe(false);
  });

  it("leaves the carrier untouched when an n8n workflow owns the operation", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await claimNumber(context, OUR_NUMBER);

    try {
      await remapMessaging(DEV_WORKSPACE_A);

      const disposition = await requestOutboundMessage(context, {
        to: CUSTOMER,
        body: "Sent by the workflow engine, not by us.",
        now: NOW,
      });

      expect(disposition.kind).toBe("succeeded");
      // Mapped workflow wins: the direct Twilio adapter never ran, so the
      // carrier saw nothing. This precedence is the product's rule and holds
      // for every provider, not just the calendar.
      expect(simulatedTwilio.all()).toHaveLength(0);
      if (disposition.kind === "succeeded") {
        expect(disposition.operation.workflowRef).toBe(`wf_sms_thread_v3__${DEV_WORKSPACE_A}`);
      }
    } finally {
      await unmapMessaging(DEV_WORKSPACE_A);
    }
  });

  it("refuses to send when the workspace has no number", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    const saved = process.env.TWILIO_PHONE_NUMBER;
    try {
      delete process.env.TWILIO_PHONE_NUMBER;
      const disposition = await requestOutboundMessage(context, {
        to: CUSTOMER,
        body: "Hello.",
        now: NOW,
      });
      expect(disposition.kind).toBe("failed");
      if (disposition.kind === "failed") expect(disposition.error.code).toBe("twilio_not_configured");
    } finally {
      if (saved) process.env.TWILIO_PHONE_NUMBER = saved;
    }
  });
});

// ── Delivery status: the async semantic-success case ────────────────────────

describeDb("a carrier accepting a message is not the message arriving", () => {
  async function sendOne(context: AuthContext): Promise<string> {
    await requestOutboundMessage(context, { to: CUSTOMER, body: "See you at 3pm.", now: NOW });
    const [message] = await workspaceScope(context, sql).messaging.listMessages();
    return message.providerMessageSid!;
  }

  it("marks a message delivered only when the carrier says so", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await claimNumber(context, OUR_NUMBER);
    const sid = await sendOne(context);

    const outcome = await ingestDeliveryStatus(
      signed(STATUS_URL, statusFields({ MessageSid: sid, MessageStatus: "delivered" }))
    );
    expect(outcome.status).toBe("accepted");

    const [message] = await workspaceScope(context, sql).messaging.listMessages();
    expect(message.status).toBe("delivered");
    expect(message.deliveredAt).toBeTruthy();
  });

  it("records a later delivery failure without reopening the operation that sent it", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await claimNumber(context, OUR_NUMBER);
    const scope = workspaceScope(context, sql);
    const sid = await sendOne(context);

    const before = await scope.orchestration.listRecent(5);
    expect(before[0]?.status).toBe("succeeded");

    await ingestDeliveryStatus(
      signed(STATUS_URL, statusFields({ MessageSid: sid, MessageStatus: "undelivered", ErrorCode: "30008" }))
    );

    const [message] = await scope.messaging.listMessages();
    expect(message.status).toBe("undelivered");
    expect(message.errorCode).toBe("30008");

    // The send genuinely succeeded — the carrier took it. Rewriting that to
    // "failed" would misreport what happened at the time, so the later fact is
    // recorded as its own event instead.
    const after = await scope.orchestration.listRecent(5);
    expect(after[0]?.status).toBe("succeeded");

    const events = await scope.integrations.listEvents(20);
    expect(events.some((e) => e.type === "message_undelivered")).toBe(true);
  });

  it("surfaces undelivered messages as a queue an operator can act on", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await claimNumber(context, OUR_NUMBER);
    const sid = await sendOne(context);

    await ingestDeliveryStatus(
      signed(STATUS_URL, statusFields({ MessageSid: sid, MessageStatus: "failed" }))
    );

    const undelivered = await workspaceScope(context, sql).messaging.listUndelivered();
    expect(undelivered).toHaveLength(1);
    expect(undelivered[0].providerMessageSid).toBe(sid);
  });

  it("applies each status transition once, but does not collapse the sequence", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await claimNumber(context, OUR_NUMBER);
    const sid = await sendOne(context);

    const sent = signed(STATUS_URL, statusFields({ MessageSid: sid, MessageStatus: "sent" }));
    const delivered = signed(STATUS_URL, statusFields({ MessageSid: sid, MessageStatus: "delivered" }));

    expect((await ingestDeliveryStatus(sent)).status).toBe("accepted");
    // The same transition again is a duplicate…
    expect((await ingestDeliveryStatus(sent)).status).toBe("duplicate");
    // …but a *later* transition is a new fact and must still be applied.
    expect((await ingestDeliveryStatus(delivered)).status).toBe("accepted");

    const [message] = await workspaceScope(context, sql).messaging.listMessages();
    expect(message.status).toBe("delivered");
  });

  it("refuses a status callback for a message another tenant sent", async () => {
    const contextA = await contextFor(await alex(), DEV_WORKSPACE_A);
    const contextB = await contextFor(await priya(), DEV_WORKSPACE_B);
    await claimNumber(contextA, OUR_NUMBER);
    await claimNumber(contextB, OTHER_NUMBER);

    const sid = await sendOne(contextA);

    // Correctly signed, but naming B's number as the sender. Tenancy resolves
    // to B, where that message sid does not exist.
    const outcome = await ingestDeliveryStatus(
      signed(STATUS_URL, statusFields({ MessageSid: sid, From: OTHER_NUMBER, MessageStatus: "delivered" }))
    );

    expect(outcome).toEqual({ status: "rejected", reason: "no message matches that provider id" });
    const [message] = await workspaceScope(contextA, sql).messaging.listMessages();
    expect(message.status).toBe("queued");
  });

  it("rejects a status vocabulary it does not understand", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await claimNumber(context, OUR_NUMBER);
    const sid = await sendOne(context);

    const outcome = await ingestDeliveryStatus(
      signed(STATUS_URL, statusFields({ MessageSid: sid, MessageStatus: "teleported" }))
    );
    expect(outcome.status).toBe("rejected");
  });
});

// ── Partial failure ─────────────────────────────────────────────────────────

describeDb("when the carrier accepts and our own write fails", () => {
  async function rejectSmsWrites(): Promise<void> {
    const ddl = testMigratorDb();
    try {
      await ddl.unsafe(`
        create or replace function reject_sms_insert() returns trigger as $$
        begin raise exception 'simulated write failure'; end;
        $$ language plpgsql;

        drop trigger if exists reject_sms_insert on sms_messages;
        create trigger reject_sms_insert before insert on sms_messages
          for each row execute function reject_sms_insert();
      `).simple();
    } finally {
      await ddl.end({ timeout: 5 });
    }
  }

  async function allowSmsWrites(): Promise<void> {
    const ddl = testMigratorDb();
    try {
      await ddl.unsafe(`
        drop trigger if exists reject_sms_insert on sms_messages;
        drop function if exists reject_sms_insert();
      `).simple();
    } finally {
      await ddl.end({ timeout: 5 });
    }
  }

  it("records sync_required and never sends the message a second time", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await claimNumber(context, OUR_NUMBER);
    const scope = workspaceScope(context, sql);

    let disposition;
    try {
      await rejectSmsWrites();
      disposition = await requestOutboundMessage(context, {
        to: CUSTOMER,
        body: "This one really went out.",
        now: NOW,
      });
    } finally {
      await allowSmsWrites();
    }

    // The carrier really took it — that is what makes this dangerous.
    expect(simulatedTwilio.all()).toHaveLength(1);

    expect(disposition.kind).toBe("failed");
    if (disposition.kind !== "failed") return;
    expect(disposition.error.code).toBe("sync_required");

    const operation = await scope.orchestration.findById(disposition.operation!.id);
    expect(operation?.status).toBe("sync_required");

    // And a retry is refused outright rather than sending a second text.
    const retry = await requestOutboundMessage(context, {
      to: CUSTOMER,
      body: "This one really went out.",
      now: NOW,
    });
    expect(retry.kind).toBe("failed");
    expect(simulatedTwilio.all()).toHaveLength(1);
  });
});

// ── Boundaries ──────────────────────────────────────────────────────────────

describeDb("no messaging infrastructure reaches a business user", () => {
  it("keeps the owner's payload free of carrier detail", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await claimNumber(context, OUR_NUMBER);
    await requestOutboundMessage(context, { to: CUSTOMER, body: "Confirmed.", now: NOW });

    const payload = JSON.stringify(await loadWorkspaceDashboard(context));

    for (const forbidden of ["twilio", "Twilio", "SM_sim", "auth_token", process.env.TWILIO_AUTH_TOKEN ?? "\0"]) {
      expect(payload).not.toContain(forbidden);
    }
    // The capability is named in business terms, not by vendor.
    expect(payload).toContain("sms");
  });

  it("never lets the auth token out of the credential store", async () => {
    const described = credentialStore.describe("twilio");
    expect(described.length).toBeGreaterThan(0);

    for (const credential of described) {
      expect(Object.keys(credential)).toEqual(["provider", "key", "label", "reference", "state"]);
      expect(credential.reference).toMatch(/^env:/);
      expect(JSON.stringify(credential)).not.toContain(process.env.TWILIO_AUTH_TOKEN ?? "\0");
    }

    // And the resolved value refuses to render itself.
    const secret = credentialStore.resolve("twilio", "auth_token");
    expect(secret).toBeInstanceOf(Secret);
    expect(String(secret)).toBe("[redacted]");
    expect(JSON.stringify({ secret })).not.toContain(process.env.TWILIO_AUTH_TOKEN ?? "\0");
  });
});
