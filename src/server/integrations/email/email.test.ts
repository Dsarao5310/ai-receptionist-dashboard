import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/types/identity";
import { DEV_WORKSPACE_A, DEV_WORKSPACE_B } from "@/data/workspace-ids";
import { authorizeWorkspace, type AuthContext } from "@/server/auth/policy";
import type { Sql } from "@/server/db/client";
import { PostgresIdentityRepository } from "@/server/db/identity";
import { workspaceScope } from "@/server/db/workspace-scope";
import { hasDatabase, resetTestDatabase, testDb } from "@/test/database";
import { normalizeEmailAddress } from "./addresses";
import { ingestSimulatedEmail, parseEmailEnvelope } from "./inbound";
import { requestOutboundEmail } from "./outbound";
import { simulatedEmail } from "./simulator";

vi.mock("server-only", () => ({}));

const NOW = new Date("2026-08-24T20:00:00.000Z");
const describeDb = hasDatabase ? describe : describe.skip;

let sql: Sql;
let identity: PostgresIdentityRepository;
let sequence = 0;
const savedEmailMode = process.env.EMAIL_PROVIDER_MODE;
const savedN8nMode = process.env.N8N_MODE;

beforeAll(async () => {
  process.env.EMAIL_PROVIDER_MODE = "simulated";
  process.env.N8N_MODE = "simulated";
  if (!hasDatabase) return;
  await resetTestDatabase(NOW);
  sql = testDb();
  identity = new PostgresIdentityRepository(sql);
  await sql`
    update workflow_mappings set operation = null
    where workspace_id in (${DEV_WORKSPACE_A}, ${DEV_WORKSPACE_B})
      and operation = 'customer.message'`;
}, 180_000);

afterAll(async () => {
  if (hasDatabase && sql) {
    await sql`
      update workflow_mappings set operation = 'customer.message'
      where workspace_id in (${DEV_WORKSPACE_A}, ${DEV_WORKSPACE_B})
        and id like '%__wf_sms'`;
    await sql.end({ timeout: 5 });
  }
  if (savedEmailMode === undefined) delete process.env.EMAIL_PROVIDER_MODE;
  else process.env.EMAIL_PROVIDER_MODE = savedEmailMode;
  if (savedN8nMode === undefined) delete process.env.N8N_MODE;
  else process.env.N8N_MODE = savedN8nMode;
});

beforeEach(() => {
  simulatedEmail.reset();
});

async function context(email: string, workspaceId: string): Promise<AuthContext> {
  const user = await identity.findUserByEmail(email);
  if (!user) throw new Error(`fixture missing: ${email}`);
  return authorizeWorkspace(user as User, workspaceId, identity);
}

const contextA = () => context("alex@coastalbloom.example", DEV_WORKSPACE_A);
const contextB = () => context("priya@harbourdental.example", DEV_WORKSPACE_B);

async function mailbox(ctx: AuthContext, address?: string) {
  sequence += 1;
  return workspaceScope(ctx, sql).email.claimMailbox({
    providerMailboxId: `gmail_mailbox_${sequence}`,
    address: address ?? `reception-${sequence}@example.test`,
    label: "Simulator mailbox",
  });
}

function envelope(input: {
  mailboxId: string;
  to: string;
  id?: string;
  threadId?: string;
  from?: string;
  workspaceId?: string;
  timestamp?: string;
}) {
  return JSON.stringify({
    eventType: "message.received",
    mailboxId: input.mailboxId,
    workspaceId: input.workspaceId,
    message: {
      id: input.id ?? `gmail_message_${sequence}`,
      threadId: input.threadId ?? `gmail_thread_${sequence}`,
      from: input.from ?? "customer@example.test",
      to: input.to,
      subject: "Appointment question",
      body: "Can I move my appointment?",
      timestamp: input.timestamp ?? NOW.toISOString(),
    },
  });
}

describe("email addresses and inbound contract", () => {
  it("canonicalizes safe addresses and rejects header injection or ambiguous input", () => {
    expect(normalizeEmailAddress("  Customer@Example.COM ")).toBe("customer@example.com");
    expect(normalizeEmailAddress("customer@example.com\r\nBcc: attacker@example.com")).toBeNull();
    expect(normalizeEmailAddress("Name <customer@example.com>")).toBeNull();
    expect(normalizeEmailAddress("missing-domain@localhost")).toBeNull();
  });

  it("requires bounded fields and an offset-bearing timestamp", () => {
    const valid = parseEmailEnvelope(
      envelope({ mailboxId: "gmail_mailbox_contract", to: "reception@example.test" })
    );
    expect(valid.ok).toBe(true);

    const noOffset = parseEmailEnvelope(
      envelope({
        mailboxId: "gmail_mailbox_contract",
        to: "reception@example.test",
        timestamp: "2026-08-24T20:00:00",
      })
    );
    expect(noOffset).toEqual({ ok: false, reason: "an offset-bearing event timestamp is required" });
  });
});

describeDb("email mailbox tenancy and inbound idempotency", () => {
  it("derives tenancy from the claimed mailbox and ignores a smuggled workspace id", async () => {
    const a = await contextA();
    const b = await contextB();
    const claimed = await mailbox(a);

    const result = await ingestSimulatedEmail(
      envelope({
        mailboxId: claimed.providerMailboxId,
        to: claimed.address,
        workspaceId: DEV_WORKSPACE_B,
      }),
      NOW
    );

    expect(result.status).toBe("accepted");
    expect(await workspaceScope(a, sql).email.listMessages()).toHaveLength(1);
    expect(await workspaceScope(b, sql).email.listMessages()).toHaveLength(0);
  });

  it("rejects an unknown mailbox and an address that does not match the trusted mapping", async () => {
    const a = await contextA();
    const claimed = await mailbox(a);

    expect(
      await ingestSimulatedEmail(
        envelope({ mailboxId: "gmail_unknown", to: claimed.address, id: "gmail_unknown_message" }),
        NOW
      )
    ).toEqual({ status: "rejected", reason: "unknown mailbox" });

    const mismatched = await ingestSimulatedEmail(
      envelope({
        mailboxId: claimed.providerMailboxId,
        to: "someone-else@example.test",
        id: "gmail_mismatch_message",
      }),
      NOW
    );
    expect(mismatched).toEqual({ status: "rejected", reason: "mailbox_address_mismatch" });
  });

  it("maps a known customer by normalized address without accepting a cross-tenant id", async () => {
    const a = await contextA();
    const claimed = await mailbox(a);
    const [customer] = await sql<{ id: string; email: string }[]>`
      select id, email from customers
      where workspace_id = ${DEV_WORKSPACE_A} and email is not null
      order by created_at asc limit 1`;

    await ingestSimulatedEmail(
      envelope({
        mailboxId: claimed.providerMailboxId,
        to: claimed.address,
        from: customer.email.toUpperCase(),
        id: "gmail_customer_mapping",
      }),
      NOW
    );

    const message = (await workspaceScope(a, sql).email.listMessages()).find(
      (entry) => entry.providerMessageId === "gmail_customer_mapping"
    );
    expect(message).toBeTruthy();
    if (!message) return;
    expect(message.customerId).toBe(customer.id);
    expect(message.direction).toBe("inbound");
    expect(message.status).toBe("received");
    expect(message.conversationId).toBeTruthy();
  });

  it("applies a redelivery once and lets Postgres arbitrate concurrent copies", async () => {
    const a = await contextA();
    const claimed = await mailbox(a);
    const raw = envelope({
      mailboxId: claimed.providerMailboxId,
      to: claimed.address,
      id: "gmail_concurrent_redelivery",
    });

    const results = await Promise.all([
      ingestSimulatedEmail(raw, NOW),
      ingestSimulatedEmail(raw, NOW),
      ingestSimulatedEmail(raw, NOW),
    ]);

    expect(results.filter((result) => result.status === "accepted")).toHaveLength(1);
    expect(results.filter((result) => result.status === "duplicate")).toHaveLength(2);
    const messages = await workspaceScope(a, sql).email.listMessages();
    expect(messages.filter((message) => message.providerMessageId === "gmail_concurrent_redelivery")).toHaveLength(1);
  });

  it("will not let two tenants claim the same provider identity or address", async () => {
    const a = await contextA();
    const b = await contextB();
    const claimed = await mailbox(a, "exclusive@example.test");

    await expect(
      workspaceScope(b, sql).email.claimMailbox({
        providerMailboxId: claimed.providerMailboxId,
        address: "different@example.test",
      })
    ).rejects.toThrow();
    await expect(
      workspaceScope(b, sql).email.claimMailbox({
        providerMailboxId: "gmail_different_provider_id",
        address: claimed.address,
      })
    ).rejects.toThrow();
  });
});

describeDb("outbound email and runtime grants", () => {
  it("hands one message to the simulator on retry and records accepted rather than delivered", async () => {
    const a = await contextA();
    await mailbox(a, "outbound@example.test");
    const input = {
      to: "recipient@example.test",
      subject: "Appointment confirmed",
      body: "Your appointment is confirmed.",
      now: NOW,
    };

    const first = await requestOutboundEmail(a, input);
    const second = await requestOutboundEmail(a, input);

    expect(first.kind).toBe("succeeded");
    expect(second.kind).toBe("duplicate");
    expect(simulatedEmail.all()).toHaveLength(1);
    const stored = (await workspaceScope(a, sql).email.listMessages()).find(
      (message) => message.subject === input.subject
    );
    expect(stored).toMatchObject({ direction: "outbound", status: "accepted" });
  });

  it("refuses provider work while the channel is disabled", async () => {
    const a = await contextA();
    const claimed = await mailbox(a);
    process.env.EMAIL_PROVIDER_MODE = "disabled";
    try {
      expect(
        await ingestSimulatedEmail(
          envelope({ mailboxId: claimed.providerMailboxId, to: claimed.address, id: "gmail_disabled_inbound" }),
          NOW
        )
      ).toEqual({ status: "unauthorized" });
      const outbound = await requestOutboundEmail(a, {
        to: "recipient-disabled@example.test",
        subject: "Disabled",
        body: "This must not be sent.",
        now: NOW,
      });
      expect(outbound.kind).toBe("failed");
      expect(simulatedEmail.all()).toHaveLength(0);
    } finally {
      process.env.EMAIL_PROVIDER_MODE = "simulated";
    }
  });

  it("does not grant the application role authority to erase durable email identity", async () => {
    await expect((async () => sql`delete from email_messages`)()).rejects.toThrow();
    await expect((async () => sql`delete from email_threads`)()).rejects.toThrow();
    await expect((async () => sql`delete from email_mailboxes`)()).rejects.toThrow();
  });
});
