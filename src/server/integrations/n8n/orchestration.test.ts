import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { User } from "@/types/identity";
import { DEV_WORKSPACE_A, DEV_WORKSPACE_B } from "@/data/workspace-ids";
import { authorizeWorkspace, type AuthContext } from "@/server/auth/policy";
import { PostgresIdentityRepository } from "@/server/db/identity";
import { workspaceScope } from "@/server/db/workspace-scope";
import type { Sql } from "@/server/db/client";
import { loadWorkspaceDashboard } from "@/server/workspace-data";
import { credentialStore, Secret } from "@/server/integrations/credential-store";
import {
  requestAppointmentCancellation,
  requestAppointmentReschedule,
} from "@/server/integrations/workflows";
import { hasDatabase, resetTestDatabase, testDb } from "@/test/database";
import { ingestEvent } from "./inbound";
import { sign } from "./signing";

/**
 * The orchestration boundary, proven against Postgres and two real tenants.
 *
 * ── What this file is actually for ──────────────────────────────────────────
 * Crossing a process boundary adds failure modes that a single-database
 * application does not have: a request that succeeded but whose response was
 * lost, a delivery that arrives twice, a caller who holds the shared secret but
 * names someone else's tenant. Those are not caught by reading the code, and
 * they are not caught by unit tests over pure functions. They are caught here,
 * by sending the actual requests to the actual pipeline and looking at what
 * ended up in the database.
 *
 * ── No production workflow is contacted ─────────────────────────────────────
 * `N8N_MODE=simulated` runs a deterministic in-process engine (see client.ts),
 * so these tests exercise signing, idempotency, state transitions and error
 * normalization end to end without a live n8n instance. The outcome is chosen
 * by the *workflow reference*, so a test picks a failure mode by pointing a
 * mapping at a differently-named workflow — never by randomness.
 */

vi.mock("server-only", () => ({}));

const NOW_ISO = "2026-08-17T20:00:00.000Z"; // Monday 13:00 in Vancouver, 16:00 in Toronto
const NOW = new Date(NOW_ISO);

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

async function userByEmail(email: string): Promise<User> {
  const user = await repo.findUserByEmail(email);
  if (!user) throw new Error(`fixture missing: ${email}`);
  return user;
}

const alex = () => userByEmail("alex@coastalbloom.example"); // owner, workspace A
const nina = () => userByEmail("nina@coastalbloom.example"); // staff, A
const marcus = () => userByEmail("marcus@coastalbloom.example"); // manager, A
const priya = () => userByEmail("priya@harbourdental.example"); // owner, workspace B

async function contextFor(user: User, workspaceId: string): Promise<AuthContext> {
  return authorizeWorkspace(user, workspaceId, repo);
}

/** A future slot inside both seeded businesses' opening hours. */
const FUTURE = { date: "2026-08-19", time: "10:00" };

async function anAppointment(context: AuthContext) {
  const scope = workspaceScope(context, sql);
  const appointments = await scope.appointments.list();
  const appointment = appointments.find((a) => a.status !== "cancelled");
  if (!appointment) throw new Error("fixture has no live appointment");
  return appointment;
}

async function configFor(context: AuthContext) {
  const configuration = await workspaceScope(context, sql).configuration.load();
  if (!configuration) throw new Error("fixture has no configuration");
  return configuration;
}

/** Point a workspace's reschedule workflow at a reference that fails a chosen way. */
async function repointRescheduleWorkflow(workspaceId: string, ref: string): Promise<void> {
  await sql`
    update workflow_mappings set workflow_ref = ${ref}
    where workspace_id = ${workspaceId} and operation = 'appointment.reschedule'`;
}

async function restoreRescheduleWorkflow(workspaceId: string): Promise<void> {
  await repointRescheduleWorkflow(workspaceId, `wf_appointment_reschedule_v1__${workspaceId}`);
}

// ── Inbound helpers ─────────────────────────────────────────────────────────

function signedRequest(payload: unknown, options: { now?: Date } = {}) {
  const body = JSON.stringify(payload);
  const secret = credentialStore.resolve("n8n", "webhook_signing_secret");
  if (!secret) throw new Error("test requires N8N_WEBHOOK_SIGNING_SECRET");

  const signedAt = options.now ?? NOW;
  const { signature, timestamp } = sign(body, secret, signedAt);
  return { rawBody: body, signature, timestamp: String(timestamp), now: NOW };
}

function bookingEvent(overrides: Record<string, unknown> = {}, data: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    eventId: `evt_${Math.random().toString(36).slice(2)}`,
    eventType: "appointment.booked",
    workflowRef: `wf_inbound_voice_v4__${DEV_WORKSPACE_A}`,
    occurredAt: NOW.toISOString(),
    data: {
      customer: { name: "Test Caller", phone: "+1 604 555 0999", email: "" },
      serviceId: null,
      date: FUTURE.date,
      time: FUTURE.time,
      notes: "Booked in a test",
      source: "voice",
      ...data,
    },
    ...overrides,
  };
}

// ── Outbound ────────────────────────────────────────────────────────────────

describeDb("outbound operations resolve a workflow from the authorized workspace", () => {
  afterEach(async () => {
    await restoreRescheduleWorkflow(DEV_WORKSPACE_A);
    await restoreRescheduleWorkflow(DEV_WORKSPACE_B);
  });

  it("invokes the workflow the workspace itself mapped, never one supplied by a caller", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    const appointment = await anAppointment(context);

    const disposition = await requestAppointmentReschedule(context, {
      appointment,
      configuration: await configFor(context),
      ...FUTURE,
      now: NOW,
    });

    expect(disposition.kind).toBe("succeeded");
    if (disposition.kind !== "succeeded") return;

    // The reference came from this workspace's mapping. There is no parameter
    // through which a caller could have named a different one.
    expect(disposition.operation.workflowRef).toBe(`wf_appointment_reschedule_v1__${DEV_WORKSPACE_A}`);
    expect(disposition.operation.workflowRef).not.toContain(DEV_WORKSPACE_B);
    expect(disposition.operation.workspaceId).toBe(DEV_WORKSPACE_A);
  });

  it("resolves a different workflow for the other tenant's identical operation", async () => {
    const context = await contextFor(await priya(), DEV_WORKSPACE_B);
    const appointment = await anAppointment(context);

    const disposition = await requestAppointmentReschedule(context, {
      appointment,
      configuration: await configFor(context),
      date: "2026-08-19",
      time: "10:00",
      now: NOW,
    });

    expect(disposition.kind).toBe("succeeded");
    if (disposition.kind !== "succeeded") return;
    expect(disposition.operation.workflowRef).toBe(`wf_appointment_reschedule_v1__${DEV_WORKSPACE_B}`);
  });

  it("proceeds locally when no workflow is mapped, rather than blocking the business", async () => {
    // A workspace that has configured no automation must still be able to run
    // its own diary. `no_workflow` is a success, not a failure.
    await sql`
      update workflow_mappings set operation = null
      where workspace_id = ${DEV_WORKSPACE_A} and operation = 'appointment.reschedule'`;

    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    const appointment = await anAppointment(context);

    const disposition = await requestAppointmentReschedule(context, {
      appointment,
      configuration: await configFor(context),
      ...FUTURE,
      now: NOW,
    });

    expect(disposition.kind).toBe("no_workflow");

    await sql`
      update workflow_mappings set operation = 'appointment.reschedule'
      where workspace_id = ${DEV_WORKSPACE_A} and id like '%__wf_reschedule'`;
  });

  it("ignores a mapping an administrator has switched off", async () => {
    await sql`
      update workflow_mappings set status = 'inactive'
      where workspace_id = ${DEV_WORKSPACE_A} and operation = 'appointment.reschedule'`;

    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    const appointment = await anAppointment(context);

    const disposition = await requestAppointmentReschedule(context, {
      appointment,
      configuration: await configFor(context),
      ...FUTURE,
      now: NOW,
    });

    expect(disposition.kind).toBe("no_workflow");

    await sql`
      update workflow_mappings set status = 'active'
      where workspace_id = ${DEV_WORKSPACE_A} and operation = 'appointment.reschedule'`;
  });
});

describeDb("outbound idempotency", () => {
  it("produces one logical operation however many times the same request arrives", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    const appointment = await anAppointment(context);
    const configuration = await configFor(context);
    const input = { appointment, configuration, date: "2026-08-19", time: "11:00", now: NOW };

    const first = await requestAppointmentReschedule(context, input);
    const second = await requestAppointmentReschedule(context, input);
    const third = await requestAppointmentReschedule(context, input);

    expect(first.kind).toBe("succeeded");
    expect(second.kind).toBe("duplicate");
    expect(third.kind).toBe("duplicate");

    if (first.kind !== "succeeded" || second.kind !== "duplicate") return;
    // The same row, not a second one that happens to look alike.
    expect(second.operation.id).toBe(first.operation.id);
    expect(second.operation.attempts).toBe(1);

    const [{ count }] = await sql`
      select count(*)::int as count from integration_operations
      where workspace_id = ${DEV_WORKSPACE_A} and idempotency_key = ${first.operation.idempotencyKey}`;
    expect(count).toBe(1);
  });

  it("treats a different target time as a different operation", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    const appointment = await anAppointment(context);
    const configuration = await configFor(context);

    const a = await requestAppointmentReschedule(context, {
      appointment,
      configuration,
      date: "2026-08-19",
      time: "12:00",
      now: NOW,
    });
    const b = await requestAppointmentReschedule(context, {
      appointment,
      configuration,
      date: "2026-08-19",
      time: "13:00",
      now: NOW,
    });

    expect(a.kind).toBe("succeeded");
    expect(b.kind).toBe("succeeded");
    if (a.kind !== "succeeded" || b.kind !== "succeeded") return;
    expect(a.operation.id).not.toBe(b.operation.id);
  });

  it("keeps two tenants' identical operations apart", async () => {
    // Same operation, same wall clock, different businesses. The key is salted
    // with the workspace, so neither can collide with or observe the other.
    const contextA = await contextFor(await alex(), DEV_WORKSPACE_A);
    const contextB = await contextFor(await priya(), DEV_WORKSPACE_B);

    const a = await requestAppointmentCancellation(contextA, {
      appointment: await anAppointment(contextA),
      configuration: await configFor(contextA),
      now: NOW,
    });
    const b = await requestAppointmentCancellation(contextB, {
      appointment: await anAppointment(contextB),
      configuration: await configFor(contextB),
      now: NOW,
    });

    expect(a.kind).toBe("succeeded");
    expect(b.kind).toBe("succeeded");
    if (a.kind !== "succeeded" || b.kind !== "succeeded") return;
    expect(a.operation.idempotencyKey).not.toBe(b.operation.idempotencyKey);
    expect(a.operation.workspaceId).toBe(DEV_WORKSPACE_A);
    expect(b.operation.workspaceId).toBe(DEV_WORKSPACE_B);
  });
});

describeDb("outbound failure modes are normalized", () => {
  afterEach(async () => {
    await restoreRescheduleWorkflow(DEV_WORKSPACE_A);
    process.env.N8N_MODE = "simulated";
  });

  async function attempt(time: string) {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    return requestAppointmentReschedule(context, {
      appointment: await anAppointment(context),
      configuration: await configFor(context),
      date: "2026-08-19",
      time,
      now: NOW,
    });
  }

  it("classifies a timeout as retryable and records the attempt", async () => {
    await repointRescheduleWorkflow(DEV_WORKSPACE_A, "wf_timeout_case");
    const result = await attempt("14:00");

    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") return;
    expect(result.error.code).toBe("n8n_timeout");
    expect(result.error.retryable).toBe(true);
    expect(result.operation?.status).toBe("retryable_failure");
    // The row exists even though nothing succeeded — that is the evidence a
    // vanished request would otherwise not leave.
    expect(result.operation?.attempts).toBe(1);
  });

  it("classifies a rejected signature as non-retryable", async () => {
    await repointRescheduleWorkflow(DEV_WORKSPACE_A, "wf_unauthorized_case");
    const result = await attempt("14:30");

    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") return;
    expect(result.error.code).toBe("n8n_unauthorized");
    expect(result.error.retryable).toBe(false);
    expect(result.operation?.status).toBe("failed");
  });

  it("classifies a workflow that refused as a business-safe failure", async () => {
    await repointRescheduleWorkflow(DEV_WORKSPACE_A, "wf_fail_case");
    const result = await attempt("15:00");

    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") return;
    expect(result.error.code).toBe("n8n_workflow_failed");
    // Written for a business audience: no status code, no host, no vendor.
    expect(result.error.message).not.toMatch(/n8n|webhook|http/i);
  });

  it("reports a configuration problem, not a network one, when orchestration is off", async () => {
    process.env.N8N_MODE = "disabled";
    const result = await attempt("15:30");

    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") return;
    expect(result.error.code).toBe("n8n_not_configured");
    expect(result.error.category).toBe("configuration");
  });

  it("lets a settled failure be retried under the same key", async () => {
    await repointRescheduleWorkflow(DEV_WORKSPACE_A, "wf_fail_case");
    const first = await attempt("16:00");
    expect(first.kind).toBe("failed");

    await restoreRescheduleWorkflow(DEV_WORKSPACE_A);
    const second = await attempt("16:00");

    expect(second.kind).toBe("succeeded");
    if (first.kind !== "failed" || second.kind !== "succeeded" || !first.operation) return;
    // The same operation, attempted twice — not a second operation.
    expect(second.operation.id).toBe(first.operation.id);
    expect(second.operation.attempts).toBe(2);
  });
});

// ── Inbound ─────────────────────────────────────────────────────────────────

describeDb("inbound events must be authentic", () => {
  it("refuses an unsigned request", async () => {
    const outcome = await ingestEvent({
      rawBody: JSON.stringify(bookingEvent()),
      signature: null,
      timestamp: null,
      now: NOW,
    });
    expect(outcome).toEqual({ status: "unauthorized" });
  });

  it("refuses a request signed with the wrong secret", async () => {
    const body = JSON.stringify(bookingEvent());
    const { signature, timestamp } = sign(body, new Secret("not-the-real-secret"), NOW);

    const outcome = await ingestEvent({ rawBody: body, signature, timestamp: String(timestamp), now: NOW });
    expect(outcome).toEqual({ status: "unauthorized" });
  });

  it("refuses a replayed request from outside the freshness window", async () => {
    const stale = new Date(NOW.getTime() - 20 * 60_000);
    const outcome = await ingestEvent(signedRequest(bookingEvent(), { now: stale }));
    expect(outcome).toEqual({ status: "unauthorized" });
  });

  it("refuses a body altered after it was signed", async () => {
    const request = signedRequest(bookingEvent());
    const tampered = { ...request, rawBody: request.rawBody.replace("Test Caller", "Someone Else") };

    expect(await ingestEvent(tampered)).toEqual({ status: "unauthorized" });
  });

  it("tells an unauthenticated caller nothing beyond 'unauthorized'", async () => {
    const outcome = await ingestEvent({
      rawBody: "not even json",
      signature: "v1=deadbeef",
      timestamp: "0",
      now: NOW,
    });

    // No reason, no hint about the secret, no indication of what was wrong.
    expect(outcome).toEqual({ status: "unauthorized" });
    expect(JSON.stringify(outcome)).not.toMatch(/secret|signature|stale|timestamp/i);
  });
});

describeDb("inbound events must be well-formed", () => {
  it("rejects an unknown event type", async () => {
    const outcome = await ingestEvent(signedRequest(bookingEvent({ eventType: "appointment.deleted" })));
    expect(outcome).toEqual({ status: "rejected", reason: "unknown eventType" });
  });

  it("rejects an unsupported schema version", async () => {
    const outcome = await ingestEvent(signedRequest(bookingEvent({ schemaVersion: 99 })));
    expect(outcome.status).toBe("rejected");
  });

  it("rejects a malformed payload", async () => {
    const outcome = await ingestEvent(signedRequest(bookingEvent({}, { time: "invalid" })));
    expect(outcome.status).toBe("rejected");
  });

  it("rejects a workflow reference it did not issue", async () => {
    const outcome = await ingestEvent(signedRequest(bookingEvent({ workflowRef: "wf_made_up" })));
    expect(outcome).toEqual({ status: "rejected", reason: "unrecognised workflow reference" });
  });

  it("revokes inbound authority when a workflow mapping is inactive", async () => {
    const workflowRef = `wf_inbound_voice_v4__${DEV_WORKSPACE_A}`;
    await sql`update workflow_mappings set status = 'inactive' where workflow_ref = ${workflowRef}`;
    try {
      const outcome = await ingestEvent(
        signedRequest(bookingEvent({ eventId: "evt_inactive_mapping", workflowRef }))
      );
      expect(outcome).toEqual({ status: "rejected", reason: "unrecognised workflow reference" });
    } finally {
      await sql`update workflow_mappings set status = 'active' where workflow_ref = ${workflowRef}`;
    }
  });
});

describeDb("inbound tenant resolution ignores the payload", () => {
  it("attributes an event by workflow reference, not by a workspaceId in the body", async () => {
    const before = await countAppointments(DEV_WORKSPACE_B);

    // Signed correctly, and claiming to belong to workspace B — while carrying
    // workspace A's workflow reference. The claim is not merely overridden; the
    // envelope has no field for it and the parser drops it.
    const outcome = await ingestEvent(
      signedRequest(
        bookingEvent({
          workspaceId: DEV_WORKSPACE_B,
          workflowRef: `wf_inbound_voice_v4__${DEV_WORKSPACE_A}`,
        })
      )
    );

    expect(outcome.status).toBe("accepted");
    expect(await countAppointments(DEV_WORKSPACE_B)).toBe(before);
  });

  it("cannot cancel the other tenant's appointment", async () => {
    const contextA = await contextFor(await alex(), DEV_WORKSPACE_A);
    const victim = await anAppointment(contextA);

    // A genuine, correctly-signed event from workspace B's workflow, naming an
    // appointment id that belongs to workspace A.
    const outcome = await ingestEvent(
      signedRequest({
        schemaVersion: 1,
        eventId: "evt_cross_tenant_attempt",
        eventType: "appointment.cancelled",
        workflowRef: `wf_appointment_cancel_v1__${DEV_WORKSPACE_B}`,
        occurredAt: NOW.toISOString(),
        data: { appointmentId: victim.id, reason: "not mine to cancel" },
      })
    );

    expect(outcome).toEqual({ status: "rejected", reason: "unknown appointment" });

    const stillThere = await workspaceScope(contextA, sql).appointments.findById(victim.id);
    expect(stillThere?.status).toBe(victim.status);
  });

  it("cannot correlate against the other tenant's operation", async () => {
    const contextA = await contextFor(await alex(), DEV_WORKSPACE_A);
    const [operation] = await workspaceScope(contextA, sql).orchestration.listRecent(1);
    expect(operation).toBeTruthy();

    const outcome = await ingestEvent(
      signedRequest({
        schemaVersion: 1,
        eventId: "evt_cross_tenant_operation",
        eventType: "workflow.execution",
        workflowRef: `wf_appointment_reschedule_v1__${DEV_WORKSPACE_B}`,
        occurredAt: NOW.toISOString(),
        data: { outcome: "succeeded", operationId: operation.id },
      })
    );

    expect(outcome).toEqual({ status: "rejected", reason: "unknown operation" });
  });
});

describeDb("inbound idempotency", () => {
  it("applies a redelivered event exactly once", async () => {
    const event = bookingEvent({ eventId: "evt_redelivered_once" });
    const before = await countAppointments(DEV_WORKSPACE_A);

    const first = await ingestEvent(signedRequest(event));
    const second = await ingestEvent(signedRequest(event));
    const third = await ingestEvent(signedRequest(event));

    expect(first.status).toBe("accepted");
    expect(second.status).toBe("duplicate");
    expect(third.status).toBe("duplicate");

    // One delivery, one appointment. This is the whole point.
    expect(await countAppointments(DEV_WORKSPACE_A)).toBe(before + 1);
  });

  it("lets the database arbitrate concurrent deliveries", async () => {
    const event = bookingEvent({ eventId: "evt_concurrent" });
    const before = await countAppointments(DEV_WORKSPACE_A);

    // Not a check-then-act race in the application: the unique constraint
    // decides, so only one of these can win however they interleave.
    const outcomes = await Promise.all([
      ingestEvent(signedRequest(event)),
      ingestEvent(signedRequest(event)),
      ingestEvent(signedRequest(event)),
    ]);

    expect(outcomes.filter((o) => o.status === "accepted")).toHaveLength(1);
    expect(await countAppointments(DEV_WORKSPACE_A)).toBe(before + 1);
  });

  it("records a permanent rejection so the sender stops retrying it", async () => {
    const event = bookingEvent({ eventId: "evt_permanently_bad" }, { time: "99:99" });

    expect((await ingestEvent(signedRequest(event))).status).toBe("rejected");
    // The receipt stands: a payload that failed validation will never pass it.
    expect((await ingestEvent(signedRequest(event))).status).toBe("duplicate");
  });
});

describeDb("inbound events obey the same business rules as the dashboard", () => {
  it("refuses a booking in the past, whatever the sender's timestamp says", async () => {
    const outcome = await ingestEvent(
      signedRequest(
        bookingEvent(
          { eventId: "evt_past_booking", occurredAt: NOW.toISOString() },
          { date: "2026-08-10", time: "10:00" }
        )
      )
    );

    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") return;
    expect(outcome.reason).toBe("The requested time has already passed.");
  });

  it("refuses a booking when the business is closed", async () => {
    const outcome = await ingestEvent(
      signedRequest(
        bookingEvent({ eventId: "evt_closed_booking" }, { date: "2026-08-19", time: "04:00" })
      )
    );

    expect(outcome.status).toBe("rejected");
    if (outcome.status !== "rejected") return;
    expect(outcome.reason).toMatch(/closed|opens/i);
  });

  it("attaches a repeat caller to their existing customer record", async () => {
    const contextA = await contextFor(await alex(), DEV_WORKSPACE_A);
    const [existing] = await workspaceScope(contextA, sql).customers.list(NOW);

    await ingestEvent(
      signedRequest(
        bookingEvent(
          { eventId: "evt_repeat_caller" },
          { customer: { name: existing.name, phone: existing.phone, email: existing.email } }
        )
      )
    );

    const appointments = await workspaceScope(contextA, sql).appointments.list();
    const created = appointments.find((a) => a.notes === "Booked in a test" && a.customerId === existing.id);
    expect(created).toBeTruthy();
  });
});

// ── Leakage ─────────────────────────────────────────────────────────────────

describeDb("no infrastructure reaches a business user", () => {
  const FORBIDDEN = [
    "n8n",
    "webhook",
    "workflow_ref",
    "workflowRef",
    "wf_appointment",
    "wf_inbound",
    "executionRef",
    "idempotencyKey",
    "signing",
    "N8N_",
  ];

  it.each([
    ["owner", alex],
    ["manager", marcus],
    ["staff", nina],
  ])("keeps the %s's page payload free of vendors and workflows", async (_role, who) => {
    const context = await contextFor(await who(), DEV_WORKSPACE_A);
    const payload = JSON.stringify(await loadWorkspaceDashboard(context));

    for (const term of FORBIDDEN) {
      expect(payload.toLowerCase()).not.toContain(term.toLowerCase());
    }
  });

  it("still tells a business user their automation needs attention", async () => {
    // The point of the vendor gate is that the *name* is hidden, not the
    // problem. A degraded engine must still surface as a degraded capability.
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    const data = await loadWorkspaceDashboard(context);

    expect(data.capabilities.length).toBeGreaterThan(0);
    for (const capability of data.capabilities) {
      expect(capability.label).not.toMatch(/n8n|vapi|twilio|google|pinecone/i);
      expect(capability.detail).not.toMatch(/n8n|vapi|twilio|google|pinecone/i);
    }
  });

  it("never lets a credential out of the credential store", async () => {
    const described = credentialStore.describe("n8n");
    expect(described.length).toBeGreaterThan(0);

    for (const credential of described) {
      // Metadata only: a label, a state, and a pointer to where the value lives.
      expect(Object.keys(credential).sort()).toEqual(["key", "label", "provider", "reference", "state"]);
      expect(credential.reference).toMatch(/^env:/);
      expect(JSON.stringify(credential)).not.toContain(process.env.N8N_WEBHOOK_SIGNING_SECRET ?? " ");
    }
  });
});

async function countAppointments(workspaceId: string): Promise<number> {
  const [{ count }] = await sql`
    select count(*)::int as count from appointments where workspace_id = ${workspaceId}`;
  return count as number;
}
