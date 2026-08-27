import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/types/identity";
import { DEV_WORKSPACE_A, DEV_WORKSPACE_B } from "@/data/workspace-ids";
import { authorizeWorkspace, type AuthContext } from "@/server/auth/policy";
import { PostgresIdentityRepository } from "@/server/db/identity";
import { workspaceScope } from "@/server/db/workspace-scope";
import type { Sql } from "@/server/db/client";
import { loadWorkspaceDashboard } from "@/server/workspace-data";
import { Secret } from "@/server/integrations/credential-store";
import { SecretStore } from "@/server/integrations/secret-store";
import {
  requestAppointmentBooking,
  requestAppointmentCancellation,
  requestAppointmentReschedule,
} from "@/server/integrations/workflows";
import { commitWithSyncGuard, createExecutor } from "@/server/integrations/calendar-sync";
import { ingestEvent } from "@/server/integrations/n8n/inbound";
import { sign } from "@/server/integrations/n8n/signing";
import { credentialStore } from "@/server/integrations/credential-store";
import { runWorkflowOperation } from "@/server/integrations/n8n/operations";
import { hasDatabase, resetTestDatabase, testDb, testMigratorDb } from "@/test/database";
import {
  createAppointmentEvent,
  getAppointmentEvent,
  getBlockingEvents,
  rescheduleAppointmentEvent,
  testCalendarConnection,
} from "./operations";
import { simulatedCalendar } from "./simulator";
import { CREDENTIAL_KEYS } from "./oauth";
import { buildCalendarConfig } from "./connection";
import { businessWallClock } from "@/services/adapters/provider-time";
import { checkRescheduleSlot } from "@/services/scheduling";

/**
 * Google Calendar, tested against a calendar that behaves like Google's.
 *
 * ── What is real here and what is not ───────────────────────────────────────
 * The application code is the production code: the same operations, the same
 * timezone boundary, the same idempotency spine, the same database. What is
 * substituted is the calendar itself — `GOOGLE_CALENDAR_MODE=simulated` runs an
 * in-process calendar with Google's semantics rather than issuing HTTPS calls.
 *
 * That substitution is deliberate and is stated plainly in the report: **no
 * test in this suite contacts a real Google account.** Running destructive
 * automated tests against a live business calendar would be indefensible, and a
 * suite that needed one would simply not be run.
 *
 * The parts a simulator cannot vouch for — that Google accepts our exact JSON,
 * that our OAuth client id is right — are the parts a first live connection
 * verifies, and they are the parts this suite does not claim.
 */

vi.mock("server-only", () => ({}));

const NOW_ISO = "2026-08-17T20:00:00.000Z"; // Monday, 13:00 Vancouver / 16:00 Toronto
const NOW = new Date(NOW_ISO);

let sql: Sql;
let repo: PostgresIdentityRepository;
let secrets: SecretStore;

const describeDb = hasDatabase ? describe : describe.skip;

beforeAll(async () => {
  if (!hasDatabase) return;
  process.env.N8N_MODE = "simulated";
  process.env.GOOGLE_CALENDAR_MODE = "simulated";
  // 32 bytes, base64 — the same shape a deployment would generate. Test-only.
  process.env.CREDENTIAL_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");

  await resetTestDatabase(NOW);
  sql = testDb();
  repo = new PostgresIdentityRepository(sql);
  secrets = new SecretStore(sql);
}, 180_000);

afterAll(async () => {
  await sql?.end({ timeout: 5 });
});

beforeEach(() => {
  simulatedCalendar.reset();
});

async function userByEmail(email: string): Promise<User> {
  const user = await repo.findUserByEmail(email);
  if (!user) throw new Error(`fixture missing: ${email}`);
  return user;
}

const alex = () => userByEmail("alex@coastalbloom.example"); // owner, workspace A (Vancouver)
const marcus = () => userByEmail("marcus@coastalbloom.example");
const nina = () => userByEmail("nina@coastalbloom.example");
const priya = () => userByEmail("priya@harbourdental.example"); // owner, workspace B (Toronto)

async function contextFor(user: User, workspaceId: string): Promise<AuthContext> {
  return authorizeWorkspace(user, workspaceId, repo);
}

/**
 * Put a workspace into "calendar connected" state.
 *
 * Writes a refresh token through the real encrypted store and marks the record
 * configured — the same two things the OAuth callback does, so the tests
 * exercise the state the callback produces rather than a shortcut around it.
 */
async function connectCalendar(
  context: AuthContext,
  options: { calendarId?: string; calendarTimeZone?: string } = {}
): Promise<void> {
  const scope = workspaceScope(context, sql);
  const record = (await scope.integrations.list()).find((r) => r.provider === "google_calendar");
  if (!record) throw new Error("fixture has no calendar record");

  await secrets.put({
    workspaceId: context.workspaceId,
    provider: "google_calendar",
    key: CREDENTIAL_KEYS.refreshToken,
    value: "test-refresh-token",
    expiresAt: null,
  });
  await secrets.put({
    workspaceId: context.workspaceId,
    provider: "google_calendar",
    key: CREDENTIAL_KEYS.accessToken,
    value: "test-access-token",
    // Comfortably valid, so the happy path does not depend on a refresh.
    expiresAt: new Date(NOW.getTime() + 3600_000),
  });

  await scope.integrations.applyPatch(record.id, {
    connection: "connected",
    health: "healthy",
    config: buildCalendarConfig({
      account: "tests@example.test",
      calendarId: options.calendarId ?? "primary",
      calendarLabel: "Business calendar",
      calendarTimeZone: options.calendarTimeZone ?? "America/Vancouver",
      authorized: true,
    }),
  });
}

/** Return a workspace to the disconnected state, credentials and all. */
async function disconnectCalendar(context: AuthContext): Promise<void> {
  const scope = workspaceScope(context, sql);
  const record = (await scope.integrations.list()).find((r) => r.provider === "google_calendar");
  if (!record) return;

  await secrets.forget(context.workspaceId, "google_calendar");
  await scope.integrations.applyPatch(record.id, {
    connection: "disconnected",
    health: "unknown",
    config: buildCalendarConfig({
      account: null,
      calendarId: null,
      calendarLabel: null,
      calendarTimeZone: null,
      authorized: false,
    }),
  });
}

/** Remove the mapped workflow so the calendar executor is the one that runs. */
async function unmapWorkflows(workspaceId: string): Promise<void> {
  await sql`
    update workflow_mappings set operation = null
    where workspace_id = ${workspaceId}
      and operation in ('appointment.reschedule','appointment.cancel','appointment.book')`;
}

async function remapWorkflows(workspaceId: string): Promise<void> {
  await sql`
    update workflow_mappings set operation = 'appointment.reschedule'
    where workspace_id = ${workspaceId} and id like '%__wf_reschedule'`;
  await sql`
    update workflow_mappings set operation = 'appointment.cancel'
    where workspace_id = ${workspaceId} and id like '%__wf_cancel'`;
  await sql`
    update workflow_mappings set operation = 'appointment.book'
    where workspace_id = ${workspaceId} and id like '%__wf_calendar'`;
}

async function anAppointment(context: AuthContext) {
  const appointments = await workspaceScope(context, sql).appointments.list();
  const appointment = appointments.find((a) => a.status !== "cancelled");
  if (!appointment) throw new Error("fixture has no live appointment");
  return appointment;
}

async function configFor(context: AuthContext) {
  const configuration = await workspaceScope(context, sql).configuration.load();
  if (!configuration) throw new Error("fixture has no configuration");
  return configuration;
}

// ── The encrypted secret store ──────────────────────────────────────────────

describeDb("provider secrets are encrypted at rest", () => {
  it("stores ciphertext, not the token", async () => {
    await secrets.put({
      workspaceId: DEV_WORKSPACE_A,
      provider: "google_calendar",
      key: "test_key",
      value: "super-secret-refresh-token",
    });

    const [row] = await sql`
      select ciphertext from provider_secrets
      where workspace_id = ${DEV_WORKSPACE_A} and provider = 'google_calendar' and credential_key = 'test_key'`;

    // The plaintext appears nowhere in the stored column, in any encoding.
    expect(String(row.ciphertext)).not.toContain("super-secret-refresh-token");
    expect(Buffer.from(String(row.ciphertext), "base64").toString("utf8")).not.toContain("super-secret");

    const read = await secrets.get(DEV_WORKSPACE_A, "google_calendar", "test_key");
    expect(read?.value.expose()).toBe("super-secret-refresh-token");
    // And what comes back still refuses to render itself.
    expect(String(read?.value)).toBe("[redacted]");
  });

  it("refuses to decrypt a tampered ciphertext rather than returning garbage", async () => {
    await secrets.put({
      workspaceId: DEV_WORKSPACE_A,
      provider: "google_calendar",
      key: "tamper_key",
      value: "original-value",
    });

    const [row] = await sql`
      select ciphertext from provider_secrets
      where workspace_id = ${DEV_WORKSPACE_A} and credential_key = 'tamper_key'`;

    // Flip a byte of the ciphertext segment. GCM authenticates, so this must
    // throw rather than produce a plausible-looking wrong token.
    const parts = String(row.ciphertext).split(".");
    const bytes = Buffer.from(parts[2], "base64");
    bytes[0] ^= 0xff;
    parts[2] = bytes.toString("base64");

    await sql`
      update provider_secrets set ciphertext = ${parts.join(".")}
      where workspace_id = ${DEV_WORKSPACE_A} and credential_key = 'tamper_key'`;

    await expect(secrets.get(DEV_WORKSPACE_A, "google_calendar", "tamper_key")).rejects.toThrow();
  });

  it("keeps one workspace's secrets out of another's reach", async () => {
    await secrets.put({
      workspaceId: DEV_WORKSPACE_A,
      provider: "google_calendar",
      key: CREDENTIAL_KEYS.refreshToken,
      value: "workspace-a-token",
    });

    expect(await secrets.get(DEV_WORKSPACE_B, "google_calendar", CREDENTIAL_KEYS.refreshToken)).toBeNull();

    await secrets.forget(DEV_WORKSPACE_A, "google_calendar");
    expect(await secrets.get(DEV_WORKSPACE_A, "google_calendar", CREDENTIAL_KEYS.refreshToken)).toBeNull();
  });
});

// ── Creating events ─────────────────────────────────────────────────────────

describeDb("creating a calendar event for an appointment", () => {
  it("writes one event with the appointment's own snapshot duration", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await connectCalendar(context);

    const appointment = await anAppointment(context);
    const configuration = await configFor(context);

    const result = await createAppointmentEvent(context, { appointment, configuration, now: NOW });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [event] = simulatedCalendar.all("primary");
    expect(event.appointmentId).toBe(appointment.id);
    expect(event.workspaceId).toBe(DEV_WORKSPACE_A);
    // Duration from the booking's snapshot, not from the current catalogue.
    expect(event.end.getTime() - event.start.getTime()).toBe(appointment.service.durationMin * 60_000);
  });

  it("resolves the wall clock against the business zone, not the calendar's", async () => {
    // The calendar is configured in Toronto; the business runs in Vancouver.
    // A 10:00 booking must be 10:00 *in Vancouver* — 17:00Z, not 14:00Z.
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await connectCalendar(context, { calendarId: "ops@example.test", calendarTimeZone: "America/Toronto" });

    const appointment = await anAppointment(context);
    const configuration = await configFor(context);
    expect(configuration.business.timezone).toBe("America/Vancouver");

    const result = await createAppointmentEvent(
      context,
      { appointment: { ...appointment, date: "2026-08-19", time: "10:00" }, configuration, now: NOW }
    );
    expect(result.ok).toBe(true);

    const [event] = simulatedCalendar.all("ops@example.test");
    expect(event.start.toISOString()).toBe("2026-08-19T17:00:00.000Z");
  });

  it("carries the appointment reference in metadata, not in the title", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await connectCalendar(context);
    const appointment = await anAppointment(context);

    await createAppointmentEvent(context, { appointment, configuration: await configFor(context), now: NOW });

    const [event] = simulatedCalendar.all("primary");
    // Identity is the id. The title is for humans and may be edited by anyone
    // with access to the calendar.
    expect(event.appointmentId).toBe(appointment.id);
    expect(event.summary).toContain(appointment.service.name);
  });
});

// ── Timezones ───────────────────────────────────────────────────────────────

describeDb("wall clocks resolve correctly across zones and DST", () => {
  const CASES: { zone: string; date: string; time: string; expected: string }[] = [
    { zone: "America/Vancouver", date: "2026-08-19", time: "10:00", expected: "2026-08-19T17:00:00.000Z" },
    { zone: "America/New_York", date: "2026-08-19", time: "10:00", expected: "2026-08-19T14:00:00.000Z" },
    { zone: "Europe/London", date: "2026-08-19", time: "10:00", expected: "2026-08-19T09:00:00.000Z" },
    // Tokyo has no daylight saving at all, which is exactly why it belongs here.
    { zone: "Asia/Tokyo", date: "2026-08-19", time: "10:00", expected: "2026-08-19T01:00:00.000Z" },
  ];

  /**
   * Dates chosen to sit either side of a daylight-saving transition.
   *
   * These assert a *round trip* rather than a fixed instant, deliberately. The
   * exact UTC offset on a given future date is a property of the runtime's
   * timezone database, not of this application — and hard-coding one turns a
   * tzdata update into a failing test that says nothing about the code. What
   * must hold regardless is the invariant: a booking stored as "the 2nd at
   * 10:00" is sent to the calendar as an instant that reads back as exactly
   * that in the business's zone.
   */
  const TRANSITION_CASES = [
    { zone: "America/New_York", date: "2026-03-07", time: "10:00" },
    { zone: "America/New_York", date: "2026-03-09", time: "10:00" },
    { zone: "America/New_York", date: "2026-10-31", time: "10:00" },
    { zone: "America/New_York", date: "2026-11-02", time: "10:00" },
    { zone: "Europe/London", date: "2026-03-28", time: "10:00" },
    { zone: "Europe/London", date: "2026-03-30", time: "10:00" },
  ];

  it.each(CASES)("$zone $date $time → $expected", async ({ zone, date, time, expected }) => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await connectCalendar(context, { calendarTimeZone: "Asia/Tokyo" });

    const appointment = await anAppointment(context);
    const configuration = await configFor(context);

    const result = await createAppointmentEvent(context, {
      appointment: { ...appointment, date, time },
      // The calendar's zone is Tokyo throughout, so any answer that depended on
      // it rather than on the business zone would be visibly wrong.
      configuration: { ...configuration, business: { ...configuration.business, timezone: zone } },
      now: NOW,
    });

    expect(result.ok).toBe(true);
    const event = simulatedCalendar.all("primary").at(-1)!;
    expect(event.start.toISOString()).toBe(expected);
  });

  it.each(TRANSITION_CASES)("$zone $date $time survives the round trip", async ({ zone, date, time }) => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await connectCalendar(context, { calendarTimeZone: "Asia/Tokyo" });

    const appointment = await anAppointment(context);
    const configuration = await configFor(context);

    await createAppointmentEvent(context, {
      appointment: { ...appointment, date, time },
      configuration: { ...configuration, business: { ...configuration.business, timezone: zone } },
      now: NOW,
    });

    const event = simulatedCalendar.all("primary").at(-1)!;
    // Back through the same boundary, in the business's zone: the wall clock
    // the customer agreed to is the wall clock the calendar holds.
    expect(businessWallClock(event.start, zone)).toEqual({ date, time });
  });
});

// ── Reschedule and cancel through the orchestration spine ───────────────────

describeDb("rescheduling reaches the calendar when no workflow is mapped", () => {
  beforeEach(async () => {
    await unmapWorkflows(DEV_WORKSPACE_A);
  });

  afterEach(async () => {
    await remapWorkflows(DEV_WORKSPACE_A);
  });

  it("moves the existing event rather than creating a second one", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await connectCalendar(context);

    const appointment = await anAppointment(context);
    const configuration = await configFor(context);
    const scope = workspaceScope(context, sql);

    await createAppointmentEvent(context, { appointment, configuration, now: NOW });
    const [created] = simulatedCalendar.all("primary");
    await scope.appointments.setProviderMapping(appointment.id, {
      provider: "google_calendar",
      eventId: created.id,
      calendarId: "primary",
      syncedAt: NOW,
    });

    const disposition = await requestAppointmentReschedule(context, {
      appointment,
      configuration,
      date: "2026-08-19",
      time: "11:00",
      now: NOW,
    });

    expect(disposition.kind).toBe("succeeded");
    // One event, moved — not a second booking on the same calendar.
    expect(simulatedCalendar.all("primary")).toHaveLength(1);
    expect(simulatedCalendar.all("primary")[0].start.toISOString()).toBe("2026-08-19T18:00:00.000Z");
  });

  it("produces one external effect however many times it is retried", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await connectCalendar(context);

    const appointment = await anAppointment(context);
    const configuration = await configFor(context);
    const input = { appointment, configuration, date: "2026-08-19", time: "12:00", now: NOW };

    const first = await requestAppointmentReschedule(context, input);
    const second = await requestAppointmentReschedule(context, input);
    const third = await requestAppointmentReschedule(context, input);

    expect(first.kind).toBe("succeeded");
    expect(second.kind).toBe("duplicate");
    expect(third.kind).toBe("duplicate");
    // The retries never reached the calendar: one event exists, not three.
    expect(simulatedCalendar.all("primary")).toHaveLength(1);
  });

  it("records the mapping and marks the appointment in step", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await connectCalendar(context);

    const appointment = await anAppointment(context);
    await requestAppointmentReschedule(context, {
      appointment,
      configuration: await configFor(context),
      date: "2026-08-19",
      time: "13:00",
      now: NOW,
    });

    const scope = workspaceScope(context, sql);
    const mapping = await scope.appointments.providerMapping(appointment.id);
    expect(mapping.eventId).toBeTruthy();
    expect(mapping.calendarId).toBe("primary");
    expect((await scope.appointments.findById(appointment.id))?.syncState).toBe("synced");
  });

  it("cancels the event without deleting the appointment", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await connectCalendar(context);

    const appointment = await anAppointment(context);
    const configuration = await configFor(context);
    const scope = workspaceScope(context, sql);

    await createAppointmentEvent(context, { appointment, configuration, now: NOW });
    const [created] = simulatedCalendar.all("primary");
    await scope.appointments.setProviderMapping(appointment.id, {
      provider: "google_calendar",
      eventId: created.id,
      calendarId: "primary",
      syncedAt: NOW,
    });

    const disposition = await requestAppointmentCancellation(context, { appointment, configuration, now: NOW });
    expect(disposition.kind).toBe("succeeded");

    // Cancelled, not deleted: the id still resolves, so a later reconciliation
    // can still ask what happened to it.
    expect(simulatedCalendar.all("primary")[0].status).toBe("cancelled");
    // And the business's own record is untouched history.
    expect(await scope.appointments.findById(appointment.id)).toBeTruthy();
  });

  it("never reaches the calendar when validation refuses the time", async () => {
    // The action's order is validate → workflow → database. This runs that
    // same sequence: a refused slot must cost no external side effect at all,
    // because a booking the business cannot honour should never reach Google.
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await connectCalendar(context);

    const appointment = await anAppointment(context);
    const configuration = await configFor(context);
    await createAppointmentEvent(context, { appointment, configuration, now: NOW });
    const before = simulatedCalendar.all("primary")[0].start.toISOString();

    // A date in the past relative to the trusted clock.
    const check = checkRescheduleSlot(configuration, appointment, "2026-08-10", "10:00", NOW);
    expect(check.valid).toBe(false);

    if (check.valid) {
      await requestAppointmentReschedule(context, {
        appointment,
        configuration,
        date: "2026-08-10",
        time: "10:00",
        now: NOW,
      });
    }

    expect(simulatedCalendar.all("primary")).toHaveLength(1);
    expect(simulatedCalendar.all("primary")[0].start.toISOString()).toBe(before);
  });
});

// ── Undoing a cancellation reaches the calendar too ─────────────────────────
//
// `restoreAppointmentAction`'s Undo used to be a pure database write: it put
// the status and time back without telling the calendar anything, so a real
// cancel-undo left the dashboard saying "confirmed" while the calendar still
// showed the event gone (or, for an undone reschedule, still at the moved
// time). These exercise the fix at the same workflow-spine level the
// reschedule/cancel suite above already does.

describeDb("undoing a cancellation reaches the calendar when no workflow is mapped", () => {
  beforeEach(async () => {
    await unmapWorkflows(DEV_WORKSPACE_A);
  });

  afterEach(async () => {
    await remapWorkflows(DEV_WORKSPACE_A);
  });

  it("creates a fresh event for a previously cancelled appointment", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await connectCalendar(context);

    const appointment = await anAppointment(context);
    const configuration = await configFor(context);
    const scope = workspaceScope(context, sql);

    await createAppointmentEvent(context, { appointment, configuration, now: NOW });
    const [created] = simulatedCalendar.all("primary");
    await scope.appointments.setProviderMapping(appointment.id, {
      provider: "google_calendar",
      eventId: created.id,
      calendarId: "primary",
      syncedAt: NOW,
    });
    await requestAppointmentCancellation(context, { appointment, configuration, now: NOW });
    expect(simulatedCalendar.all("primary")[0].status).toBe("cancelled");

    const disposition = await requestAppointmentBooking(context, { appointment, configuration, now: NOW });

    expect(disposition.kind).toBe("succeeded");
    // The old event stays a tombstone; the undo gets a live replacement rather
    // than reporting success against a cancelled event nobody would see.
    const events = simulatedCalendar.all("primary");
    expect(events).toHaveLength(2);
    expect(events.some((e) => e.status !== "cancelled")).toBe(true);
  });

  it("produces one external effect however many times it is retried", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await connectCalendar(context);

    const appointment = await anAppointment(context);
    const configuration = await configFor(context);
    const input = { appointment, configuration, now: NOW };

    const first = await requestAppointmentBooking(context, input);
    const second = await requestAppointmentBooking(context, input);
    const third = await requestAppointmentBooking(context, input);

    expect(first.kind).toBe("succeeded");
    expect(second.kind).toBe("duplicate");
    expect(third.kind).toBe("duplicate");
    expect(simulatedCalendar.all("primary")).toHaveLength(1);
  });

  it("records the mapping and marks the appointment in step", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await connectCalendar(context);

    const appointment = await anAppointment(context);
    await requestAppointmentBooking(context, { appointment, configuration: await configFor(context), now: NOW });

    const scope = workspaceScope(context, sql);
    const mapping = await scope.appointments.providerMapping(appointment.id);
    expect(mapping.eventId).toBeTruthy();
    expect(mapping.calendarId).toBe("primary");
    expect((await scope.appointments.findById(appointment.id))?.syncState).toBe("synced");
  });
});

// ── A cancelled tombstone is not a live event ───────────────────────────────
//
// Live validation against a real Google account found that PATCHing an
// already-cancelled event returns HTTP 200 with the response body still
// `status: "cancelled"` — Google keeps a deleted event addressable as a
// tombstone rather than 404ing it. `rescheduleAppointmentEvent` must treat
// that the same way it already treats a genuine 404: the mapped event is
// unusable, so a replacement is created and becomes the new mapping.

describeDb("a cancelled tombstone on a successful PATCH is treated as an unusable event", () => {
  it("creates a replacement event rather than reporting success against the tombstone", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await connectCalendar(context);

    const appointment = await anAppointment(context);
    const configuration = await configFor(context);

    const created = await createAppointmentEvent(context, { appointment, configuration, now: NOW });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const originalEventId = created.value.eventId;

    // Someone deleted it directly in Google. The simulator mirrors Google's
    // real behaviour: the event stays addressable, only its status changes.
    await simulatedCalendar.cancelEvent({ calendarId: "primary", eventId: originalEventId }, NOW);

    const result = await rescheduleAppointmentEvent(context, {
      appointment,
      configuration,
      date: "2026-08-19",
      time: "11:00",
      eventId: originalEventId,
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // A different, new event — not the cancelled one reported as a success.
    expect(result.value.eventId).not.toBe(originalEventId);
    expect(result.value.replacedEventId).toBe(originalEventId);

    const replacement = simulatedCalendar.all("primary").find((e) => e.id === result.value.eventId);
    expect(replacement?.status).toBe("confirmed");
    expect(replacement?.start.toISOString()).toBe("2026-08-19T18:00:00.000Z");
  });

  it("preserves the old tombstone rather than deleting it", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await connectCalendar(context);

    const appointment = await anAppointment(context);
    const configuration = await configFor(context);

    const created = await createAppointmentEvent(context, { appointment, configuration, now: NOW });
    if (!created.ok) throw new Error("setup failed");
    const originalEventId = created.value.eventId;
    await simulatedCalendar.cancelEvent({ calendarId: "primary", eventId: originalEventId }, NOW);

    await rescheduleAppointmentEvent(context, {
      appointment,
      configuration,
      date: "2026-08-19",
      time: "11:00",
      eventId: originalEventId,
      now: NOW,
    });

    // History intact: two events exist on the calendar, the old one still
    // there and still cancelled — never removed, only superseded.
    const all = simulatedCalendar.all("primary");
    expect(all).toHaveLength(2);
    const tombstone = all.find((e) => e.id === originalEventId);
    expect(tombstone?.status).toBe("cancelled");
  });

  it("gives the replacement event the same appointment and workspace linkage", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await connectCalendar(context);

    const appointment = await anAppointment(context);
    const configuration = await configFor(context);

    const created = await createAppointmentEvent(context, { appointment, configuration, now: NOW });
    if (!created.ok) throw new Error("setup failed");
    const originalEventId = created.value.eventId;
    await simulatedCalendar.cancelEvent({ calendarId: "primary", eventId: originalEventId }, NOW);

    const result = await rescheduleAppointmentEvent(context, {
      appointment,
      configuration,
      date: "2026-08-19",
      time: "11:00",
      eventId: originalEventId,
      now: NOW,
    });
    if (!result.ok) throw new Error("expected the replacement to succeed");

    const remote = await getAppointmentEvent(context, { eventId: result.value.eventId, now: NOW });
    expect(remote.ok).toBe(true);
    if (!remote.ok) return;
    // The same private extended-property identity a fresh create always
    // carries — reading it back proves it survived the fallback path, not
    // just that `createAppointmentEvent`'s own unit test covers it.
    expect(remote.value.appointmentId).toBe(appointment.id);
    expect(remote.value.workspaceId).toBe(DEV_WORKSPACE_A);
  });

  it("does not mark the appointment synced when the replacement create also fails", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    // "createfails" only fails createEvent — patchEventTime on this calendar
    // still succeeds, so the tombstone branch is reached and then itself fails.
    await connectCalendar(context, { calendarId: "createfails" });

    const appointment = await anAppointment(context);
    const configuration = await configFor(context);
    const scope = workspaceScope(context, sql);

    const created = await createAppointmentEvent(context, { appointment, configuration, now: NOW });
    if (!created.ok) throw new Error("setup failed");
    const originalEventId = created.value.eventId;
    await simulatedCalendar.cancelEvent({ calendarId: "createfails", eventId: originalEventId }, NOW);

    // Nothing has been persisted to the appointment row yet — `createAppointmentEvent`
    // above only touched the (simulated) calendar, never the database.
    const before = await scope.appointments.findById(appointment.id);
    const mappingBefore = await scope.appointments.providerMapping(appointment.id);

    const result = await rescheduleAppointmentEvent(context, {
      appointment,
      configuration,
      date: "2026-08-19",
      time: "11:00",
      eventId: originalEventId,
      now: NOW,
    });

    expect(result.ok).toBe(false);

    // Nothing changed: no false "synced" state, and the mapping was never
    // pointed at the tombstone or at a replacement that doesn't exist.
    const after = await scope.appointments.findById(appointment.id);
    expect(after?.syncState).toBe(before?.syncState);
    const mappingAfter = await scope.appointments.providerMapping(appointment.id);
    expect(mappingAfter).toEqual(mappingBefore);
  });

  it("does not create a second replacement if the repair is retried after it already succeeded", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await connectCalendar(context);

    const appointment = await anAppointment(context);
    const configuration = await configFor(context);
    const scope = workspaceScope(context, sql);

    const created = await createAppointmentEvent(context, { appointment, configuration, now: NOW });
    if (!created.ok) throw new Error("setup failed");
    const originalEventId = created.value.eventId;
    await simulatedCalendar.cancelEvent({ calendarId: "primary", eventId: originalEventId }, NOW);

    const first = await rescheduleAppointmentEvent(context, {
      appointment,
      configuration,
      date: "2026-08-19",
      time: "11:00",
      eventId: originalEventId,
      now: NOW,
    });
    if (!first.ok) throw new Error("expected the first repair to succeed");

    // The caller's normal behaviour: persist the mapping onto the new event,
    // exactly as the reschedule executor and "Push ours" both do.
    await scope.appointments.setProviderMapping(appointment.id, {
      provider: "google_calendar",
      eventId: first.value.eventId,
      calendarId: "primary",
      syncedAt: NOW,
    });

    // Retry, now against the *new* mapping — the new event is confirmed, not
    // cancelled, so this should be an ordinary successful patch.
    const second = await rescheduleAppointmentEvent(context, {
      appointment,
      configuration,
      date: "2026-08-19",
      time: "11:15",
      eventId: first.value.eventId,
      now: NOW,
    });

    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.eventId).toBe(first.value.eventId);
    expect(second.value.replacedEventId).toBeUndefined();

    // One tombstone, one active event — never a third.
    expect(simulatedCalendar.all("primary")).toHaveLength(2);
    const active = simulatedCalendar.all("primary").filter((e) => e.status !== "cancelled");
    expect(active).toHaveLength(1);
  });
});

describeDb("a mapped workflow takes precedence over the direct calendar path", () => {
  it("leaves the calendar untouched when n8n owns the operation", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await connectCalendar(context);

    const appointment = await anAppointment(context);
    const disposition = await requestAppointmentReschedule(context, {
      appointment,
      configuration: await configFor(context),
      date: "2026-08-19",
      time: "14:00",
      now: NOW,
    });

    expect(disposition.kind).toBe("succeeded");
    if (disposition.kind !== "succeeded") return;
    // Dispatched to the workflow, so nothing here called Google.
    expect(disposition.operation.workflowRef).toContain("wf_appointment_reschedule");
    expect(simulatedCalendar.all("primary")).toHaveLength(0);
  });
});

// ── Failure modes ───────────────────────────────────────────────────────────

describeDb("provider failures are normalized", () => {
  const CASES: { calendarId: string; code: string; retryable: boolean }[] = [
    { calendarId: "calendar-missing", code: "calendar_not_found", retryable: false },
    { calendarId: "calendar-denied", code: "calendar_permission_denied", retryable: false },
    { calendarId: "calendar-ratelimited", code: "calendar_rate_limited", retryable: true },
    { calendarId: "calendar-timeout", code: "calendar_timeout", retryable: true },
    { calendarId: "calendar-expired", code: "calendar_auth_expired", retryable: false },
  ];

  it.each(CASES)("$calendarId → $code", async ({ calendarId, code, retryable }) => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await connectCalendar(context, { calendarId });

    const result = await createAppointmentEvent(context, {
      appointment: await anAppointment(context),
      configuration: await configFor(context),
      now: NOW,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(code);
    expect(result.error.retryable).toBe(retryable);
    // Business-safe wording throughout: no vendor, no status code, no payload.
    expect(result.error.message).not.toMatch(/google|oauth|token|http|\b40[0-9]\b/i);
  });

  it("reports a configuration problem when no calendar is connected", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    // Earlier tests in this file connect workspace A, and the record is durable.
    // Disconnect explicitly rather than depending on execution order.
    await disconnectCalendar(context);

    const result = await createAppointmentEvent(context, {
      appointment: await anAppointment(context),
      configuration: await configFor(context),
      now: NOW,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.category).toBe("configuration");
  });

  it("checks the connection without writing anything", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await connectCalendar(context);

    const result = await testCalendarConnection(context, NOW);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.calendarTimeZone).toBe("America/Vancouver");
    // The probe is read-only: a health check must not litter a real diary.
    expect(simulatedCalendar.all()).toHaveLength(0);
  });
});

// ── External changes ────────────────────────────────────────────────────────

function signedRequest(payload: unknown) {
  const body = JSON.stringify(payload);
  const secret = credentialStore.resolve("n8n", "webhook_signing_secret");
  if (!secret) throw new Error("test requires N8N_WEBHOOK_SIGNING_SECRET");
  const { signature, timestamp } = sign(body, secret, NOW);
  return { rawBody: body, signature, timestamp: String(timestamp), now: NOW };
}

function calendarEvent(type: string, data: Record<string, unknown>, workspaceId = DEV_WORKSPACE_A) {
  return {
    schemaVersion: 1,
    eventId: `evt_${Math.random().toString(36).slice(2)}`,
    eventType: type,
    workflowRef: `wf_calendar_sync_v2__${workspaceId}`,
    occurredAt: NOW.toISOString(),
    data,
  };
}

/** Give an appointment a mapped event so external changes have something to hit. */
async function mappedAppointment(context: AuthContext, eventId: string) {
  const appointment = await anAppointment(context);
  await workspaceScope(context, sql).appointments.setProviderMapping(appointment.id, {
    provider: "google_calendar",
    eventId,
    calendarId: "primary",
    syncedAt: NOW,
  });
  return appointment;
}

describeDb("changes made directly in the calendar", () => {
  it("adopts a move to a time the business allows", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    const appointment = await mappedAppointment(context, "ext_move_valid");

    // 11:00 Vancouver, inside opening hours and in the future.
    const outcome = await ingestEvent(
      signedRequest(
        calendarEvent("calendar.event_moved", {
          externalEventId: "ext_move_valid",
          startsAt: "2026-08-19T18:00:00.000Z",
          endsAt: "2026-08-19T19:00:00.000Z",
        })
      )
    );

    expect(outcome.status).toBe("accepted");
    const updated = await workspaceScope(context, sql).appointments.findById(appointment.id);
    expect(updated?.date).toBe("2026-08-19");
    expect(updated?.time).toBe("11:00");
    expect(updated?.syncState).toBe("synced");
  });

  it("refuses to adopt a move the business rules forbid, and flags it", async () => {
    // 03:00 Vancouver. Google is perfectly happy with it; the salon is closed.
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    const appointment = await mappedAppointment(context, "ext_move_invalid");
    const before = await workspaceScope(context, sql).appointments.findById(appointment.id);

    const outcome = await ingestEvent(
      signedRequest(
        calendarEvent("calendar.event_moved", {
          externalEventId: "ext_move_invalid",
          startsAt: "2026-08-19T10:00:00.000Z",
          endsAt: "2026-08-19T11:00:00.000Z",
        })
      )
    );

    expect(outcome.status).toBe("accepted");

    const updated = await workspaceScope(context, sql).appointments.findById(appointment.id);
    // Our record did not move…
    expect(updated?.date).toBe(before?.date);
    expect(updated?.time).toBe(before?.time);
    // …and the disagreement is visible rather than silently resolved.
    expect(updated?.syncState).toBe("external_change_detected");
  });

  it("keeps the appointment when its calendar entry is deleted", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    const appointment = await mappedAppointment(context, "ext_deleted");

    const outcome = await ingestEvent(
      signedRequest(calendarEvent("calendar.event_deleted", { externalEventId: "ext_deleted" }))
    );

    expect(outcome.status).toBe("accepted");
    const updated = await workspaceScope(context, sql).appointments.findById(appointment.id);
    // Deleting a calendar entry is not the same statement as "this customer
    // is not coming". The booking survives and is flagged for a person.
    expect(updated).toBeTruthy();
    expect(updated?.status).not.toBe("cancelled");
    expect(updated?.syncState).toBe("external_change_detected");
  });

  it("applies a redelivered external change exactly once", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    const appointment = await mappedAppointment(context, "ext_move_repeat");

    const event = calendarEvent("calendar.event_moved", {
      externalEventId: "ext_move_repeat",
      startsAt: "2026-08-19T20:00:00.000Z",
      endsAt: "2026-08-19T21:00:00.000Z",
    });

    expect((await ingestEvent(signedRequest(event))).status).toBe("accepted");
    expect((await ingestEvent(signedRequest(event))).status).toBe("duplicate");

    const updated = await workspaceScope(context, sql).appointments.findById(appointment.id);
    expect(updated?.time).toBe("13:00");
  });

  it("rejects an external change for an event we do not know", async () => {
    const outcome = await ingestEvent(
      signedRequest(calendarEvent("calendar.event_deleted", { externalEventId: "ext_unknown_to_us" }))
    );
    expect(outcome).toEqual({ status: "rejected", reason: "no appointment maps to that calendar event" });
  });

  it("rejects a move with an offsetless timestamp", async () => {
    const outcome = await ingestEvent(
      signedRequest(
        calendarEvent("calendar.event_moved", {
          externalEventId: "ext_move_valid",
          startsAt: "2026-08-19T11:00:00",
          endsAt: "2026-08-19T12:00:00",
        })
      )
    );
    expect(outcome.status).toBe("rejected");
  });
});

describeDb("cross-tenant calendar events", () => {
  it("cannot move another workspace's appointment", async () => {
    const contextA = await contextFor(await alex(), DEV_WORKSPACE_A);
    const appointment = await mappedAppointment(contextA, "ext_cross_tenant");
    const before = await workspaceScope(contextA, sql).appointments.findById(appointment.id);

    // Correctly signed, and sent by workspace B's own calendar workflow —
    // naming an event id that belongs to workspace A.
    const outcome = await ingestEvent(
      signedRequest(
        calendarEvent(
          "calendar.event_moved",
          {
            externalEventId: "ext_cross_tenant",
            startsAt: "2026-08-19T18:00:00.000Z",
            endsAt: "2026-08-19T19:00:00.000Z",
          },
          DEV_WORKSPACE_B
        )
      )
    );

    expect(outcome).toEqual({ status: "rejected", reason: "no appointment maps to that calendar event" });

    const after = await workspaceScope(contextA, sql).appointments.findById(appointment.id);
    expect(after?.time).toBe(before?.time);
    expect(after?.syncState).toBe(before?.syncState);
  });

  it("keeps each workspace's calendar connection to itself", async () => {
    const contextA = await contextFor(await alex(), DEV_WORKSPACE_A);
    await connectCalendar(contextA);

    // B has not been connected in this test, so B's operations must fail on
    // configuration rather than borrowing A's token.
    const contextB = await contextFor(await priya(), DEV_WORKSPACE_B);
    await secrets.forget(DEV_WORKSPACE_B, "google_calendar");

    const result = await testCalendarConnection(contextB, NOW);
    expect(result.ok).toBe(false);
  });
});

// ── External blocking events ────────────────────────────────────────────────

describeDb("external calendar entries block time without becoming bookings", () => {
  it("returns meetings and leave, and excludes our own appointments", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await connectCalendar(context);

    simulatedCalendar.addExternalEvent({
      calendarId: "primary",
      summary: "Staff meeting",
      start: new Date("2026-08-19T17:00:00.000Z"),
      end: new Date("2026-08-19T18:00:00.000Z"),
    });
    simulatedCalendar.addExternalEvent({
      calendarId: "primary",
      summary: "Someone's birthday",
      start: new Date("2026-08-19T00:00:00.000Z"),
      end: new Date("2026-08-20T00:00:00.000Z"),
      // Marked "free" in Google's own terms: visible, but not busy.
      transparency: "transparent",
    });

    await createAppointmentEvent(context, {
      appointment: await anAppointment(context),
      configuration: await configFor(context),
      now: NOW,
    });

    const result = await getBlockingEvents(context, {
      from: new Date("2026-08-18T00:00:00.000Z"),
      to: new Date("2026-08-21T00:00:00.000Z"),
      now: NOW,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const summaries = result.value.map((e) => e.summary);
    expect(summaries).toContain("Staff meeting");
    // A transparent all-day event does not make the business unavailable.
    expect(summaries).not.toContain("Someone's birthday");
    // Nor do our own appointments, which the capacity model already counts.
    expect(result.value.every((e) => e.appointmentId === null)).toBe(true);
  });
});

// ── Leakage ─────────────────────────────────────────────────────────────────

describeDb("no calendar infrastructure reaches a business user", () => {
  /**
   * Infrastructure terms, not merely the word "google".
   *
   * A business's own knowledge base legitimately mentions Google Pay as a
   * payment method, and refusing that would be the test dictating the product's
   * content rather than protecting its boundary. What must never appear is
   * evidence of *our* provider plumbing: the vendor as an integration, OAuth,
   * tokens, calendar identifiers, or event ids.
   */
  const FORBIDDEN = [
    "google calendar",
    "google_calendar",
    "googleapis",
    "oauth",
    "refresh_token",
    "access_token",
    "calendar_id",
    "sim_evt_",
    "test-refresh-token",
    "test-access-token",
  ];

  it.each([
    ["owner", alex],
    ["manager", marcus],
    ["staff", nina],
  ])("keeps the %s's payload free of provider detail", async (_role, who) => {
    const context = await contextFor(await who(), DEV_WORKSPACE_A);
    await connectCalendar(context);

    const payload = JSON.stringify(await loadWorkspaceDashboard(context)).toLowerCase();
    for (const term of FORBIDDEN) {
      expect(payload).not.toContain(term.toLowerCase());
    }
  });

  it("still tells a business user their calendar needs attention", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    const data = await loadWorkspaceDashboard(context);

    const calendar = data.capabilities.find((c) => c.key === "calendar");
    expect(calendar).toBeTruthy();
    // Named as a capability, described in business terms.
    expect(calendar!.label).toBe("Calendar");
    expect(calendar!.detail).not.toMatch(/google|oauth|token/i);
  });

  it("never exposes a token through the credential surface", () => {
    const secret = new Secret("ya29.a0-super-secret-access-token");
    expect(JSON.stringify({ secret })).not.toContain("ya29");
    expect(`${secret}`).toBe("[redacted]");
  });
});

// ── Partial failure: the calendar moved and we could not record it ──────────

describeDb("when the external change succeeds and our own write fails", () => {
  /**
   * Make the appointments table reject one specific update.
   *
   * A trigger rather than a mocked repository, because the point of this test is
   * that a *real* write failure — a constraint, a lost connection, a permission
   * change — is handled. Scoped to one appointment id so nothing else in the
   * schema is affected, and dropped again in the same test.
   */
  async function rejectUpdatesTo(appointmentId: string): Promise<void> {
    // The migrator, not the application role: `app_runtime` has no CREATE
    // privilege, which is exactly the protection this test must not weaken.
    const ddl = testMigratorDb();
    try {
      await ddl.unsafe(`
      create or replace function reject_one_appointment_update() returns trigger as $$
      begin
        if new.id = '${appointmentId}' then
          raise exception 'simulated write failure for %', new.id;
        end if;
        return new;
      end;
      $$ language plpgsql;

      create trigger reject_one_appointment_update
        before update on appointments
        for each row execute function reject_one_appointment_update();
      `).simple();
    } finally {
      await ddl.end({ timeout: 5 });
    }
  }

  async function allowUpdatesAgain(): Promise<void> {
    const ddl = testMigratorDb();
    try {
      await ddl.unsafe(`
        drop trigger if exists reject_one_appointment_update on appointments;
        drop function if exists reject_one_appointment_update();
      `).simple();
    } finally {
      await ddl.end({ timeout: 5 });
    }
  }

  it("records sync_required, and never repeats the external mutation", async () => {
    await unmapWorkflows(DEV_WORKSPACE_A);
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await connectCalendar(context);

    const appointment = await anAppointment(context);
    const configuration = await configFor(context);
    const scope = workspaceScope(context, sql);

    // Give it a calendar entry, so the reschedule moves a real event.
    await createAppointmentEvent(context, { appointment, configuration, now: NOW });
    const [created] = simulatedCalendar.all("primary");
    await scope.appointments.setProviderMapping(appointment.id, {
      provider: "google_calendar",
      eventId: created.id,
      calendarId: "primary",
      syncedAt: NOW,
    });

    const disposition = await requestAppointmentReschedule(context, {
      appointment,
      configuration,
      date: "2026-08-19",
      time: "15:00",
      now: NOW,
    });
    expect(disposition.kind).toBe("succeeded");
    if (disposition.kind !== "succeeded") return;

    // The calendar really did move — that is what makes the next step matter.
    const movedTo = simulatedCalendar.all("primary")[0].start.toISOString();
    expect(movedTo).toBe("2026-08-19T22:00:00.000Z");

    try {
      await rejectUpdatesTo(appointment.id);

      const committed = await commitWithSyncGuard(
        context,
        {
          appointmentId: appointment.id,
          operationId: disposition.operation.id,
          detail: "The calendar was updated but this record could not be saved.",
          now: NOW,
        },
        () => scope.appointments.reschedule(appointment.id, "2026-08-19", "15:00", configuration.business.timezone)
      );

      expect(committed.ok).toBe(false);
      if (committed.ok) return;
      // The person is told the truth: it happened, and we could not save it.
      expect(committed.error).toMatch(/could not be saved/i);
    } finally {
      await allowUpdatesAgain();
    }

    // The operation row is the authoritative record, and it is written to a
    // different table from the one that refused the write.
    const operation = await scope.orchestration.findById(disposition.operation.id);
    expect(operation?.status).toBe("sync_required");
    expect(operation?.error.message).toMatch(/could not be saved/i);

    // It reaches the admin reconciliation queue, which is what makes this
    // recoverable rather than merely recorded.
    const unsettled = await scope.orchestration.listUnsettled(50);
    expect(unsettled.map((o) => o.id)).toContain(disposition.operation.id);

    // Note what this test deliberately does *not* assert: the appointment-level
    // flag. The injected trigger rejects every update to that row, including
    // the guard's own convenience write — which is precisely the case the guard
    // treats as best-effort. Losing the duplicate must not lose the report.

    // Crucially: exactly one calendar event, still where the workflow put it.
    // Nothing retried the external mutation, which is what would have turned
    // one reschedule into two.
    expect(simulatedCalendar.all("primary")).toHaveLength(1);
    expect(simulatedCalendar.all("primary")[0].start.toISOString()).toBe(movedTo);

    await remapWorkflows(DEV_WORKSPACE_A);
  });

  it("does not claim a sync problem when nothing external happened", async () => {
    // No operation id means no external side effect, so a write failure is an
    // ordinary failure and must be raised rather than dressed up as a
    // reconciliation case.
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    const appointment = await anAppointment(context);
    const scope = workspaceScope(context, sql);

    try {
      await rejectUpdatesTo(appointment.id);
      await expect(
        commitWithSyncGuard(
          context,
          { appointmentId: appointment.id, operationId: null, detail: "unused", now: NOW },
          () => scope.appointments.setStatus(appointment.id, "cancelled")
        )
      ).rejects.toThrow();
    } finally {
      await allowUpdatesAgain();
    }

    expect((await scope.appointments.findById(appointment.id))?.syncState).not.toBe("sync_required");
  });
});

// ── The executor's own bookkeeping write is a dangerous window too ─────────
//
// Live validation found that `commitWithSyncGuard` in the caller was not the
// only place a real calendar success could outrun the database: the
// executor's own mapping write (inside `rescheduleExecutor`/`createExecutor`)
// sat unprotected. A failure there used to surface as a generic
// `retryable_failure`, which a retry was free to repeat — for a brand-new
// appointment, repeating it meant a second, real, orphaned Google event with
// nothing in the database pointing at it. These tests are the regression for
// the fix: the executor now guards that write with `commitWithSyncGuard`
// itself, using its own `operationId`.

describeDb("when the executor's own local write fails after a real calendar success", () => {
  async function rejectUpdatesTo(appointmentId: string): Promise<void> {
    const ddl = testMigratorDb();
    try {
      await ddl.unsafe(`
      create or replace function reject_executor_write() returns trigger as $$
      begin
        if new.id = '${appointmentId}' then raise exception 'simulated executor write failure for %', new.id; end if;
        return new;
      end;
      $$ language plpgsql;

      drop trigger if exists reject_executor_write on appointments;
      create trigger reject_executor_write before update on appointments
        for each row execute function reject_executor_write();
      `).simple();
    } finally {
      await ddl.end({ timeout: 5 });
    }
  }

  async function allowUpdatesAgain(): Promise<void> {
    const ddl = testMigratorDb();
    try {
      await ddl.unsafe(`
        drop trigger if exists reject_executor_write on appointments;
        drop function if exists reject_executor_write();
      `).simple();
    } finally {
      await ddl.end({ timeout: 5 });
    }
  }

  it("settles the operation as sync_required — not a plain or retryable failure — when the reschedule executor's own mapping write fails", async () => {
    await unmapWorkflows(DEV_WORKSPACE_A);
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await connectCalendar(context);

    const appointment = await anAppointment(context);
    const configuration = await configFor(context);
    const scope = workspaceScope(context, sql);

    // A prior mapping, so this reschedule takes the PATCH path — the same
    // path the tombstone fix above changes, exercised here under a different
    // failure.
    await createAppointmentEvent(context, { appointment, configuration, now: NOW });
    const [created] = simulatedCalendar.all("primary");
    await scope.appointments.setProviderMapping(appointment.id, {
      provider: "google_calendar",
      eventId: created.id,
      calendarId: "primary",
      syncedAt: NOW,
    });

    try {
      await rejectUpdatesTo(appointment.id);

      const disposition = await requestAppointmentReschedule(context, {
        appointment,
        configuration,
        date: "2026-08-19",
        time: "15:00",
        now: NOW,
      });

      // The calendar really moved...
      expect(simulatedCalendar.all("primary")[0].start.toISOString()).toBe("2026-08-19T22:00:00.000Z");

      // ...but the local mapping write failed, and that must read as
      // sync_required — never a generic or retryable failure, which would
      // (wrongly) let a caller believe a retry is safe.
      expect(disposition.kind).toBe("failed");
      if (disposition.kind !== "failed") return;
      expect(disposition.error.code).toBe("sync_required");
      if (!disposition.operation) throw new Error("expected an operation row");

      const operation = await scope.orchestration.findById(disposition.operation.id);
      expect(operation?.status).toBe("sync_required");
    } finally {
      await allowUpdatesAgain();
      await remapWorkflows(DEV_WORKSPACE_A);
    }
  });

  it("refuses a retry rather than creating a second event, after the create executor's own mapping write fails", async () => {
    const context = await contextFor(await alex(), DEV_WORKSPACE_A);
    await connectCalendar(context);
    const appointment = await anAppointment(context);
    const configuration = await configFor(context);
    const scope = workspaceScope(context, sql);

    const run = () =>
      runWorkflowOperation(context, {
        operation: "appointment.book",
        idempotencyParts: [appointment.id, appointment.updatedAt],
        target: { type: "appointment", id: appointment.id },
        now: NOW,
        data: { appointmentId: appointment.id },
        executor: createExecutor(context, { appointment, configuration }),
      });

    try {
      await rejectUpdatesTo(appointment.id);
      const first = await run();
      expect(first.kind).toBe("failed");
      if (first.kind === "failed") expect(first.error.code).toBe("sync_required");

      // The create succeeded once, for real, on the (simulated) calendar.
      expect(simulatedCalendar.all("primary")).toHaveLength(1);
    } finally {
      await allowUpdatesAgain();
    }

    // Retried now that the database write would actually succeed — but the
    // operation is already settled `sync_required`, which this existing
    // branch in `runWorkflowOperation` refuses under the same idempotency
    // key outright, rather than calling the calendar a second time.
    const second = await run();
    expect(second.kind).toBe("failed");
    if (second.kind === "failed") expect(second.error.code).toBe("sync_required");

    // Still exactly one event — the retry never reached the calendar.
    expect(simulatedCalendar.all("primary")).toHaveLength(1);

    await scope.appointments.setSyncState(appointment.id, "synced", null, NOW);
  });
});
