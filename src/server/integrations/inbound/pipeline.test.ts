import { beforeAll, afterAll, describe, expect, it, vi } from "vitest";
import { DEV_WORKSPACE_A, DEV_WORKSPACE_B } from "@/data/workspace-ids";
import type { Sql } from "@/server/db/client";
import { workspaceScope } from "@/server/db/workspace-scope";
import { authorizeWorkspace } from "@/server/auth/policy";
import { PostgresIdentityRepository } from "@/server/db/identity";
import { hasDatabase, resetTestDatabase, testDb } from "@/test/database";
import { ingestInboundEvent, type InboundProvider } from "./pipeline";

/**
 * The shared inbound pipeline, proven with a provider that is not n8n.
 *
 * ── Why a synthetic provider rather than more n8n tests ─────────────────────
 * The gate sequence was extracted from the n8n path, and n8n's own 32 tests
 * prove it still behaves identically for n8n. What they cannot prove is that
 * the extraction is genuinely *provider-agnostic* rather than n8n's logic with
 * an interface painted on — because n8n is the only caller.
 *
 * So this file supplies a second, deliberately different provider: it verifies
 * a different way, parses a different shape, resolves its tenant from a
 * different mapping, and reports under a different `source`. If the pipeline
 * had n8n assumptions baked in, this file is where they surface.
 *
 * The provider exists only here. It is not registered, not routed, and cannot
 * receive real traffic — it is a test double for the *contract*, in the same
 * spirit as the calendar simulator.
 */

vi.mock("server-only", () => ({}));

const NOW = new Date("2026-08-17T20:00:00.000Z");

let sql: Sql;
let repo: PostgresIdentityRepository;

const describeDb = hasDatabase ? describe : describe.skip;

beforeAll(async () => {
  if (!hasDatabase) return;
  process.env.N8N_MODE = "simulated";
  await resetTestDatabase(NOW);
  sql = testDb();
  repo = new PostgresIdentityRepository(sql);
}, 180_000);

afterAll(async () => {
  await sql?.end({ timeout: 5 });
});

/**
 * A provider whose every gate is deliberately unlike n8n's.
 *
 * Verification is a bare header equality check (not an HMAC over the body),
 * the payload is form-encoded (not JSON), and the tenant comes from a "phone
 * number" style mapping carried in the payload rather than a workflow
 * reference — the shape Twilio will actually need.
 */
interface TestEnvelope {
  eventId: string;
  line: string;
  text: string;
}

const tenantByLine: Record<string, string> = {
  "+15550001111": DEV_WORKSPACE_A,
  "+15550002222": DEV_WORKSPACE_B,
};

const applied: { workspaceId: string; text: string }[] = [];

const testProvider: InboundProvider<TestEnvelope> = {
  // Reusing an existing provider id: the schema constrains `source` to the
  // known vocabulary, and this proves a *non-n8n* source now persists at all —
  // which migration 0008 is what made possible.
  source: "twilio",

  verify(request) {
    return request.headers.get("x-test-signature") === "good"
      ? { valid: true }
      : { valid: false, reason: "bad signature" };
  },

  parse(request) {
    // Form-encoded, not JSON — the pipeline must not assume a body format.
    const params = new URLSearchParams(request.rawBody);
    const eventId = params.get("EventId");
    const line = params.get("To");
    if (!eventId || !line) return { ok: false, reason: "missing EventId or To" };
    return { ok: true, value: { eventId, line, text: params.get("Body") ?? "" } };
  },

  async resolveTenant(envelope) {
    const workspaceId = tenantByLine[envelope.line];
    return workspaceId
      ? { ok: true, workspaceId }
      : { ok: false, reason: "unrecognised line" };
  },

  identity(envelope) {
    return { externalEventId: envelope.eventId, eventType: "message.received", schemaVersion: 1 };
  },

  async apply(scope, envelope) {
    applied.push({ workspaceId: scope.workspaceId, text: envelope.text });
    return { ok: true, detail: `Handled ${envelope.eventId}.`, operationId: null };
  },

  audit: { accepted: "workflow.event_received", rejected: "workflow.event_rejected" },
};

function request(body: string, signature = "good") {
  return {
    url: "https://example.test/api/internal/twilio/messages",
    headers: new Headers({ "x-test-signature": signature }),
    rawBody: body,
    now: NOW,
  };
}

const body = (over: Partial<Record<string, string>> = {}) =>
  new URLSearchParams({
    EventId: "SM_test_1",
    To: "+15550001111",
    Body: "hello",
    ...over,
  }).toString();

describeDb("the shared inbound pipeline, driven by a non-n8n provider", () => {
  it("refuses an unverified request without touching the database", async () => {
    const before = applied.length;
    const outcome = await ingestInboundEvent(testProvider, request(body(), "wrong"));

    expect(outcome).toEqual({ status: "unauthorized" });
    // Gate 1 runs before anything else: no receipt, no business effect.
    expect(applied).toHaveLength(before);
    const [row] = await sql`
      select count(*)::int as count from integration_inbound_events
      where external_event_id = 'SM_test_1'`;
    expect(row.count).toBe(0);
  });

  it("rejects a payload it cannot parse, after verification", async () => {
    const outcome = await ingestInboundEvent(testProvider, request("Body=only"));
    expect(outcome).toEqual({ status: "rejected", reason: "missing EventId or To" });
  });

  it("rejects an event whose tenant cannot be resolved from a mapping we issued", async () => {
    const outcome = await ingestInboundEvent(
      testProvider,
      request(body({ EventId: "SM_unknown_line", To: "+15559999999" }))
    );
    expect(outcome).toEqual({ status: "rejected", reason: "unrecognised line" });
  });

  it("accepts a valid event and applies it in the resolved workspace", async () => {
    const outcome = await ingestInboundEvent(testProvider, request(body({ EventId: "SM_ok_1" })));

    expect(outcome.status).toBe("accepted");
    expect(applied.at(-1)).toEqual({ workspaceId: DEV_WORKSPACE_A, text: "hello" });

    // The receipt persisted under a source that was impossible before 0008.
    const [row] = await sql`
      select source, workspace_id, outcome from integration_inbound_events
      where external_event_id = 'SM_ok_1'`;
    expect(row.source).toBe("twilio");
    expect(row.workspace_id).toBe(DEV_WORKSPACE_A);
    expect(row.outcome).toBe("accepted");
  });

  it("applies a redelivered event exactly once", async () => {
    const first = await ingestInboundEvent(testProvider, request(body({ EventId: "SM_dupe" })));
    const before = applied.length;
    const second = await ingestInboundEvent(testProvider, request(body({ EventId: "SM_dupe" })));

    expect(first.status).toBe("accepted");
    expect(second.status).toBe("duplicate");
    // The business effect ran once, which is the whole guarantee.
    expect(applied).toHaveLength(before);
  });

  it("lets the database arbitrate concurrent deliveries of one event", async () => {
    const before = applied.length;
    const outcomes = await Promise.all([
      ingestInboundEvent(testProvider, request(body({ EventId: "SM_race" }))),
      ingestInboundEvent(testProvider, request(body({ EventId: "SM_race" }))),
      ingestInboundEvent(testProvider, request(body({ EventId: "SM_race" }))),
    ]);

    // Exactly one winner, whichever it was: the unique constraint decided, not
    // a check-then-act race in the application.
    expect(outcomes.filter((o) => o.status === "accepted")).toHaveLength(1);
    expect(applied).toHaveLength(before + 1);
  });

  it("keeps two tenants' identically-numbered events apart", async () => {
    await ingestInboundEvent(testProvider, request(body({ EventId: "SM_shared_id", To: "+15550001111" })));
    await ingestInboundEvent(testProvider, request(body({ EventId: "SM_shared_id", To: "+15550002222" })));

    // The receipt key is (workspace, source, event id), so the same provider id
    // arriving for two tenants is two events, not a duplicate.
    const rows = await sql`
      select workspace_id from integration_inbound_events
      where external_event_id = 'SM_shared_id' order by workspace_id`;
    expect(rows.map((r) => r.workspace_id)).toEqual([DEV_WORKSPACE_A, DEV_WORKSPACE_B]);
  });

  it("writes the business effect and the receipt in one transaction", async () => {
    const before = applied.length;
    const failing: InboundProvider<TestEnvelope> = {
      ...testProvider,
      async apply() {
        throw new Error("simulated failure inside the transaction");
      },
    };

    const outcome = await ingestInboundEvent(failing, request(body({ EventId: "SM_rollback" })));

    expect(outcome.status).toBe("failed");
    expect(applied).toHaveLength(before);
    // The receipt rolled back with it, so the sender may retry and will get a
    // clean attempt rather than a spent event id.
    const [row] = await sql`
      select count(*)::int as count from integration_inbound_events
      where external_event_id = 'SM_rollback'`;
    expect(row.count).toBe(0);
  });

  it("records the event against the resolved workspace only", async () => {
    await ingestInboundEvent(testProvider, request(body({ EventId: "SM_scope", To: "+15550002222" })));

    const contextA = await authorizeWorkspace(
      (await repo.findUserByEmail("alex@coastalbloom.example"))!,
      DEV_WORKSPACE_A,
      repo
    );
    const events = await workspaceScope(contextA, sql).orchestration.listEvents(50);

    // Workspace A cannot see an event that belonged to workspace B, even though
    // both arrived through the same endpoint and the same signature.
    expect(events.map((e) => e.externalEventId)).not.toContain("SM_scope");
  });
});
