import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/types/identity";
import { DEV_WORKSPACE_A, DEV_WORKSPACE_B } from "@/data/workspace-ids";
import { authorizeWorkspace, type AuthContext } from "@/server/auth/policy";
import { PostgresIdentityRepository } from "@/server/db/identity";
import { workspaceScope } from "@/server/db/workspace-scope";
import type { Sql } from "@/server/db/client";
import { hasDatabase, resetTestDatabase, testDb } from "@/test/database";
import { ingestVapiEvent, parseVapiEnvelope, vapiInboundProvider } from "./inbound";

vi.mock("server-only", () => ({}));

const NOW = new Date("2026-08-24T20:00:00.000Z");
const TOKEN = "simulated-vapi-webhook-token-with-32-characters";
const ASSISTANT_A = "asst_coastal";
const PHONE_A_ID = "phone_coastal";
const PHONE_B_ID = "phone_harbour";
const PHONE_A = "+16045550142";
const PHONE_B = "+16045550199";
const CUSTOMER = "+16045550111";

let sql: Sql;
let identities: PostgresIdentityRepository;
const describeDb = hasDatabase ? describe : describe.skip;

beforeAll(async () => {
  process.env.VAPI_MODE = "simulated";
  process.env.VAPI_WEBHOOK_BEARER_TOKEN = TOKEN;
  if (!hasDatabase) return;
  await resetTestDatabase(NOW);
  sql = testDb();
  identities = new PostgresIdentityRepository(sql);
}, 180_000);

afterAll(async () => {
  await sql?.end({ timeout: 5 });
});

beforeEach(async () => {
  if (!hasDatabase) return;
  await sql`delete from integration_inbound_events where source = 'vapi'`;
  await sql`delete from vapi_assistants`;
  await sql`delete from provider_phone_numbers where provider = 'vapi'`;
});

async function userByEmail(email: string): Promise<User> {
  const user = await identities.findUserByEmail(email);
  if (!user) throw new Error(`fixture missing: ${email}`);
  return user;
}

async function contextFor(email: string, workspaceId: string): Promise<AuthContext> {
  return authorizeWorkspace(await userByEmail(email), workspaceId, identities);
}

async function mapAssistant(context: AuthContext, assistantId: string): Promise<void> {
  await workspaceScope(context, sql).vapi.claimAssistant({ assistantId, label: "Test assistant" });
}

async function mapPhone(context: AuthContext, phoneNumberId: string, phoneNumber: string): Promise<void> {
  await workspaceScope(context, sql).messaging.claimNumber({
    provider: "vapi",
    providerSid: phoneNumberId,
    phoneNumber,
    label: "Test voice line",
    smsEnabled: false,
    voiceEnabled: true,
  });
}

function body(input: {
  callId?: string;
  type?: "status-update" | "end-of-call-report";
  status?: string;
  timestamp?: string;
  startedAt?: string;
  endedAt?: string;
  endedReason?: string;
  assistantId?: string;
  phoneNumberId?: string;
  phoneNumber?: string;
  workspaceId?: string;
  summary?: string;
  messages?: unknown[];
} = {}): string {
  const type = input.type ?? "status-update";
  return JSON.stringify({
    message: {
      type,
      ...(type === "status-update" ? { status: input.status ?? "in-progress" } : {}),
      timestamp: input.timestamp ?? "2026-08-24T20:00:00.000Z",
      ...(input.startedAt ? { startedAt: input.startedAt } : {}),
      ...(input.endedAt ? { endedAt: input.endedAt } : {}),
      ...(input.endedReason ? { endedReason: input.endedReason } : {}),
      call: {
        id: input.callId ?? "call_vapi_1",
        assistantId: input.assistantId ?? ASSISTANT_A,
        phoneNumberId: input.phoneNumberId ?? PHONE_A_ID,
        customer: { number: CUSTOMER },
        metadata: { workspaceId: input.workspaceId ?? DEV_WORKSPACE_B },
      },
      phoneNumber: {
        id: input.phoneNumberId ?? PHONE_A_ID,
        number: input.phoneNumber ?? PHONE_A,
      },
      ...(input.summary ? { analysis: { summary: input.summary } } : {}),
      ...(input.messages ? { artifact: { messages: input.messages, recording: { stereoUrl: "https://recording.invalid/private" } } } : {}),
    },
  });
}

function signed(rawBody: string, token = TOKEN) {
  return { rawBody, authorization: `Bearer ${token}`, now: NOW };
}

describe("Vapi contract parsing", () => {
  it("normalizes an offset-bearing in-progress event", () => {
    const parsed = parseVapiEnvelope(body({ startedAt: "2026-08-24T19:59:58.000Z" }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toMatchObject({
      kind: "status-update",
      callId: "call_vapi_1",
      domainStatus: "in_progress",
      assistantId: ASSISTANT_A,
      phoneNumberId: PHONE_A_ID,
    });
  });

  it("rejects unsupported events, naive timestamps, and payload tenancy without a trusted resource", () => {
    expect(parseVapiEnvelope(JSON.stringify({ message: { type: "tool-calls", call: { id: "c" } } })).ok).toBe(false);
    expect(parseVapiEnvelope(body({ timestamp: "2026-08-24T20:00:00" })).ok).toBe(false);
    const noResources = JSON.stringify({
      message: {
        type: "status-update",
        status: "in-progress",
        timestamp: "2026-08-24T20:00:00Z",
        call: { id: "call_untrusted", metadata: { workspaceId: DEV_WORKSPACE_A } },
      },
    });
    expect(parseVapiEnvelope(noResources)).toEqual({
      ok: false,
      reason: "a trusted assistant or phone resource is required",
    });
  });

  it("verifies the configured bearer credential without exposing it", async () => {
    const rawBody = body();
    const request = (authorization: string | null) => ({
      url: "",
      headers: new Headers(authorization ? { authorization } : {}),
      rawBody,
      now: NOW,
    });
    expect(await vapiInboundProvider.verify(request(`Bearer ${TOKEN}`))).toEqual({ valid: true });
    expect(await vapiInboundProvider.verify(request("Bearer wrong"))).toMatchObject({ valid: false });
    expect(await vapiInboundProvider.verify(request(null))).toMatchObject({ valid: false });
  });
});

describeDb("Vapi inbound lifecycle", () => {
  it("refuses bad authentication before any tenant write", async () => {
    const context = await contextFor("alex@coastalbloom.example", DEV_WORKSPACE_A);
    await mapAssistant(context, ASSISTANT_A);
    const outcome = await ingestVapiEvent(signed(body(), "wrong-token"));
    expect(outcome).toEqual({ status: "unauthorized" });
    const [row] = await sql`select count(*) as count from calls where provider = 'vapi'`;
    expect(Number(row.count)).toBe(0);
  });

  it("ignores payload workspace metadata and writes only to the trusted assistant mapping", async () => {
    const contextA = await contextFor("alex@coastalbloom.example", DEV_WORKSPACE_A);
    await mapAssistant(contextA, ASSISTANT_A);

    const outcome = await ingestVapiEvent(signed(body({
      callId: "call_tenant_binding",
      startedAt: "2026-08-24T19:59:58.000Z",
      workspaceId: DEV_WORKSPACE_B,
    })));
    expect(outcome.status).toBe("accepted");

    const rows = await sql`
      select workspace_id, provider_call_id, status from calls
      where provider_call_id = 'call_tenant_binding'`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ workspace_id: DEV_WORKSPACE_A, status: "in_progress" });
  });

  it("rejects assistant and phone mappings that resolve to different tenants", async () => {
    const contextA = await contextFor("alex@coastalbloom.example", DEV_WORKSPACE_A);
    const contextB = await contextFor("priya@harbourdental.example", DEV_WORKSPACE_B);
    await mapAssistant(contextA, ASSISTANT_A);
    await mapPhone(contextB, PHONE_B_ID, PHONE_B);

    const outcome = await ingestVapiEvent(signed(body({
      callId: "call_mapping_conflict",
      phoneNumberId: PHONE_B_ID,
      phoneNumber: PHONE_B,
    })));
    expect(outcome.status).toBe("rejected");
    const [row] = await sql`select count(*) as count from calls where provider_call_id = 'call_mapping_conflict'`;
    expect(Number(row.count)).toBe(0);
  });

  it("arbitrates duplicate deliveries in Postgres", async () => {
    const context = await contextFor("alex@coastalbloom.example", DEV_WORKSPACE_A);
    await mapAssistant(context, ASSISTANT_A);
    const request = signed(body({ callId: "call_duplicate", startedAt: "2026-08-24T19:59:58Z" }));
    expect((await ingestVapiEvent(request)).status).toBe("accepted");
    expect((await ingestVapiEvent(request)).status).toBe("duplicate");
    const [row] = await sql`select count(*) as count from calls where provider_call_id = 'call_duplicate'`;
    expect(Number(row.count)).toBe(1);
  });

  it("persists the final report and refuses an older event to regress terminal state", async () => {
    const context = await contextFor("alex@coastalbloom.example", DEV_WORKSPACE_A);
    await mapAssistant(context, ASSISTANT_A);
    await mapPhone(context, PHONE_A_ID, PHONE_A);

    expect((await ingestVapiEvent(signed(body({
      callId: "call_terminal",
      startedAt: "2026-08-24T20:00:00Z",
      timestamp: "2026-08-24T20:00:00Z",
    })))).status).toBe("accepted");

    const report = body({
      callId: "call_terminal",
      type: "end-of-call-report",
      timestamp: "2026-08-24T20:10:00Z",
      startedAt: "2026-08-24T20:00:00Z",
      endedAt: "2026-08-24T20:10:00Z",
      endedReason: "customer-ended-call",
      summary: "Customer asked about opening hours.",
      messages: [
        { role: "assistant", message: "How can I help?", secondsFromStart: 2 },
        { role: "user", message: "When are you open?", secondsFromStart: 7 },
      ],
    });
    expect((await ingestVapiEvent(signed(report))).status).toBe("accepted");

    const older = body({
      callId: "call_terminal",
      status: "in-progress",
      timestamp: "2026-08-24T20:05:00Z",
      startedAt: "2026-08-24T20:00:00Z",
    });
    expect((await ingestVapiEvent(signed(older))).status).toBe("accepted");

    const [call] = await sql`
      select status, duration_sec, recording_url, provider_updated_at
      from calls where workspace_id = ${DEV_WORKSPACE_A} and provider_call_id = 'call_terminal'`;
    expect(call.status).toBe("completed");
    expect(Number(call.duration_sec)).toBe(600);
    expect(call.recording_url).toBeNull();
    expect(new Date(String(call.provider_updated_at)).toISOString()).toBe("2026-08-24T20:10:00.000Z");

    const conversations = await workspaceScope(context, sql).conversations.list();
    const conversation = conversations.find((item) => item.summary === "Customer asked about opening hours.");
    expect(conversation?.transcript).toEqual([
      { speaker: "ai", text: "How can I help?", time: "0:02" },
      { speaker: "customer", text: "When are you open?", time: "0:07" },
    ]);

    const serialized = JSON.stringify(await workspaceScope(context, sql).calls.list());
    expect(serialized).not.toContain("call_terminal");
    expect(serialized).not.toContain(ASSISTANT_A);
    expect(serialized).not.toContain(PHONE_A_ID);
    expect(serialized).not.toContain("recording.invalid");
  });
});
