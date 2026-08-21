import type { AppConfiguration, Dataset } from "@/types";
import type { User, WorkspaceMembership, WorkspaceRecord } from "@/types/identity";
import { DEFAULT_CONFIGURATION } from "@/data/default-config";
import { buildDataset } from "@/data/seed";
import { buildEvents, buildIntegrations, buildWorkflows } from "@/data/integrations-seed";
import { DEV_WORKSPACE_A, DEV_WORKSPACE_B } from "@/data/workspace-ids";
import { DEV_AUDIT, DEV_MEMBERSHIPS, DEV_USERS, DEV_WORKSPACES } from "./fixtures";
import { wallClockToInstant } from "@/lib/timezone";
import { sanitizeConfig } from "@/services/integrations";
import type { Sql, Tx } from "./client";

/**
 * Development seed.
 *
 * ── What it produces ────────────────────────────────────────────────────────
 * Two complete tenants, so every cross-tenant test has something real to fail
 * against:
 *
 *   Coastal Bloom Salon  America/Vancouver  Alex (owner), Marcus (manager), Nina (staff)
 *   Harbour Dental       America/Toronto    Priya (owner)
 *
 * plus Sam, a platform operator who is a member of neither — the fixture that
 * proves platform access comes from `platform_role` and not from quietly
 * enrolling the operator everywhere.
 *
 * The two timezones are not decoration. Almost every timezone bug in this
 * product would have been invisible with one tenant, because a single zone lets
 * "the business's day" and "the server's day" agree by accident.
 *
 * ── Deterministic ───────────────────────────────────────────────────────────
 * The domain data comes from the same seeded generator the product has always
 * used (`data/seed.ts`, mulberry32, fixed seed per workspace), so a reseeded
 * database is byte-identical apart from the timestamps that are deliberately
 * relative to "now". Security tests depend on that: a test that fails only on
 * Tuesdays is worse than no test.
 *
 * ── Never in production ─────────────────────────────────────────────────────
 * `seedDatabase` refuses to run when NODE_ENV is production. Demo data
 * appearing in a real tenant would be a data-integrity incident, not a
 * cosmetic problem.
 */

/** Ids in the generated dataset are per-dataset (`cust_1`); two tenants would collide. */
function scoped(workspaceId: string, id: string): string {
  const tenant = workspaceId === DEV_WORKSPACE_A ? "a" : "b";
  return `${id}_${tenant}`;
}

interface TenantPlan {
  workspaceId: string;
  configuration: AppConfiguration;
  dataset: Dataset;
}

function harbourDentalConfiguration(): AppConfiguration {
  return {
    ...DEFAULT_CONFIGURATION,
    business: {
      ...DEFAULT_CONFIGURATION.business,
      name: "Harbour Dental",
      phone: "(416) 555-0188",
      email: "reception@harbourdental.example",
      address: "220 Bay Street, Toronto, ON M5J 2W4",
      website: "https://harbourdental.example",
      timezone: "America/Toronto",
      category: "Dental practice",
      description: "A downtown dental practice offering check-ups, hygiene and emergency appointments.",
    },
    // A different working week, so a test that assumed Coastal Bloom's hours
    // fails here rather than passing by coincidence.
    hours: [
      { day: "Mon", isOpen: true, intervals: [{ open: "08:00", close: "12:00" }, { open: "13:00", close: "17:00" }] },
      { day: "Tue", isOpen: true, intervals: [{ open: "08:00", close: "12:00" }, { open: "13:00", close: "17:00" }] },
      { day: "Wed", isOpen: true, intervals: [{ open: "08:00", close: "12:00" }, { open: "13:00", close: "17:00" }] },
      { day: "Thu", isOpen: true, intervals: [{ open: "08:00", close: "12:00" }, { open: "13:00", close: "19:00" }] },
      { day: "Fri", isOpen: true, intervals: [{ open: "08:00", close: "14:00" }] },
      { day: "Sat", isOpen: false, intervals: [] },
      { day: "Sun", isOpen: false, intervals: [] },
    ],
    ai: {
      ...DEFAULT_CONFIGURATION.ai,
      greeting: "Thanks for calling Harbour Dental. How can I help you today?",
      personality: "professional",
    },
  };
}

export async function seedDatabase(sql: Sql, now = new Date()): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed demo data in production.");
  }

  const plans: TenantPlan[] = [
    {
      workspaceId: DEV_WORKSPACE_A,
      configuration: DEFAULT_CONFIGURATION,
      dataset: buildDataset(now, 42, DEFAULT_CONFIGURATION.business.timezone),
    },
    {
      workspaceId: DEV_WORKSPACE_B,
      configuration: harbourDentalConfiguration(),
      // A different seed and a smaller history: Harbour Dental is the newer
      // tenant, and identical data in both would hide a scoping mistake.
      dataset: buildDataset(now, 7, "America/Toronto"),
    },
  ];

  await sql.begin(async (tx) => {
    await clear(tx);
    await seedIdentity(tx);
    for (const plan of plans) {
      await seedConfiguration(tx, plan);
      await seedDomain(tx, plan, now);
      await seedIntegrations(tx, plan.workspaceId, now);
    }
    await seedAudit(tx);
  });
}

/**
 * Start from empty.
 *
 * Deleting the workspaces would cascade to almost everything, but users are
 * referenced by `workspaces.owner_user_id` with ON DELETE RESTRICT and audit
 * rows survive by design — so the order matters and is written out rather than
 * left to the cascade graph.
 */
async function clear(tx: Tx): Promise<void> {
  await tx`delete from audit_events`;
  await tx`delete from workspaces`;
  await tx`delete from users`;
}

async function seedIdentity(tx: Tx): Promise<void> {
  for (const user of DEV_USERS as User[]) {
    await tx`
      insert into users (id, name, email, avatar_url, job_title, platform_role, status, created_at, updated_at)
      values (${user.id}, ${user.name}, ${user.email}, ${user.avatarUrl},
              ${user.jobTitle},
              ${user.platformRole}, ${user.status}, ${user.createdAt}, ${user.updatedAt})`;
  }

  const tiers: Record<string, { tier: string; conversations: number; minutes: number; notes: string }> = {
    [DEV_WORKSPACE_A]: {
      tier: "professional",
      conversations: 1000,
      minutes: 1500,
      notes: "Migrated from the trial plan in March. Owner prefers SMS follow-ups.",
    },
    [DEV_WORKSPACE_B]: {
      tier: "starter",
      conversations: 300,
      minutes: 400,
      notes: "Onboarding in progress. Calendar not yet authorised.",
    },
  };

  for (const workspace of DEV_WORKSPACES as WorkspaceRecord[]) {
    const plan = tiers[workspace.id];
    await tx`
      insert into workspaces (
        id, name, slug, status, subscription_status, tier, owner_user_id,
        conversations_included, minutes_included, internal_notes, created_at, updated_at
      ) values (
        ${workspace.id}, ${workspace.name}, ${workspace.slug}, ${workspace.status},
        ${workspace.subscriptionStatus}, ${plan.tier}, ${workspace.ownerUserId},
        ${plan.conversations}, ${plan.minutes}, ${plan.notes},
        ${workspace.createdAt}, ${workspace.updatedAt}
      )`;
  }

  for (const membership of DEV_MEMBERSHIPS as WorkspaceMembership[]) {
    await tx`
      insert into workspace_memberships
        (id, user_id, workspace_id, role, status, invited_at, joined_at)
      values
        (${membership.id}, ${membership.userId}, ${membership.workspaceId}, ${membership.role},
         ${membership.status}, ${membership.invitedAt}, ${membership.joinedAt})`;
  }
}

async function seedConfiguration(tx: Tx, { workspaceId, configuration }: TenantPlan): Promise<void> {
  const { business, hours, specialHours, services, knowledge, ai } = configuration;

  await tx`
    insert into business_profiles
      (workspace_id, name, phone, email, address, website, timezone, category, description)
    values
      (${workspaceId}, ${business.name}, ${business.phone}, ${business.email}, ${business.address},
       ${business.website}, ${business.timezone}, ${business.category}, ${business.description})`;

  for (const day of hours) {
    await tx`
      insert into business_hours (workspace_id, weekday, is_open)
      values (${workspaceId}, ${day.day}, ${day.isOpen})`;
    for (const [position, interval] of day.intervals.entries()) {
      await tx`
        insert into business_hour_intervals (workspace_id, weekday, position, opens_at, closes_at)
        values (${workspaceId}, ${day.day}, ${position}, ${interval.open}, ${interval.close})`;
    }
  }

  for (const special of specialHours) {
    const id = scoped(workspaceId, special.id);
    await tx`
      insert into special_hours (id, workspace_id, on_date, label, is_closed)
      values (${id}, ${workspaceId}, ${special.date}, ${special.label}, ${special.isClosed})`;
    for (const [position, interval] of special.intervals.entries()) {
      await tx`
        insert into special_hour_intervals (special_hours_id, position, opens_at, closes_at)
        values (${id}, ${position}, ${interval.open}, ${interval.close})`;
    }
  }

  // Service ids are NOT scoped per tenant. They are the catalogue ids the
  // generated appointment history references (`svc_haircut`), and both tenants
  // start from the same catalogue — so they are made unique by prefixing with
  // the workspace, and the dataset's references are rewritten to match.
  for (const [position, service] of services.entries()) {
    await tx`
      insert into services
        (id, workspace_id, name, description, price_model, price, duration_min, active, position)
      values
        (${scoped(workspaceId, service.id)}, ${workspaceId}, ${service.name}, ${service.description},
         ${service.priceModel}, ${service.price}, ${service.durationMin}, ${service.active}, ${position})`;
  }

  for (const [position, entry] of knowledge.entries()) {
    await tx`
      insert into knowledge_entries
        (id, workspace_id, category, title, content, active, position)
      values
        (${scoped(workspaceId, entry.id)}, ${workspaceId}, ${entry.category}, ${entry.title},
         ${entry.content}, ${entry.active}, ${position})`;
  }

  await tx`
    insert into ai_configurations (
      workspace_id, enabled, channel_voice, channel_sms, channel_email, greeting, personality,
      voice_name, voice_speed_pct, voice_tone,
      booking_default_duration_min, booking_min_notice_min, booking_max_advance_days,
      booking_max_concurrent, booking_send_confirmation, booking_allow_reschedule,
      booking_allow_cancellation,
      escalation_when_unsure, escalation_urgent, escalation_unsupported, after_hours
    ) values (
      ${workspaceId}, ${ai.enabled}, ${ai.channels.voice}, ${ai.channels.sms}, ${ai.channels.email},
      ${ai.greeting}, ${ai.personality},
      ${ai.voice.name}, ${ai.voice.speedPct}, ${ai.voice.tone},
      ${ai.booking.defaultDurationMin}, ${ai.booking.minNoticeMin}, ${ai.booking.maxAdvanceDays},
      ${ai.booking.maxConcurrent}, ${ai.booking.sendConfirmation}, ${ai.booking.allowReschedule},
      ${ai.booking.allowCancellation},
      ${ai.escalation.whenUnsure}, ${ai.escalation.urgentRequests}, ${ai.escalation.unsupportedRequests},
      ${ai.afterHours}
    )`;
}

/**
 * Rows go in as multi-row inserts, not one statement each.
 *
 * A tenant is roughly four thousand rows once transcripts are counted. Inserted
 * individually over a network connection that is a few thousand round trips,
 * and seeding takes minutes instead of seconds — which matters because the test
 * suite reseeds.
 */
async function insertMany(tx: Tx, table: string, rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return;
  const columns = Object.keys(rows[0]);
  // Chunked so a large tenant does not build one enormous statement.
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500);
    await tx`insert into ${tx(table)} ${tx(chunk, ...columns)}`;
  }
}

async function seedDomain(tx: Tx, { workspaceId, configuration, dataset }: TenantPlan, now: Date): Promise<void> {
  const zone = configuration.business.timezone;
  const id = (value: string) => scoped(workspaceId, value);

  await insertMany(
    tx,
    "customers",
    dataset.customers.map((customer) => ({
      id: id(customer.id),
      workspace_id: workspaceId,
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      created_at: customer.createdAt,
    }))
  );

  // Appointments before conversations: a conversation may reference the booking
  // it produced, not the other way round.
  await insertMany(
    tx,
    "appointments",
    dataset.appointments.map((appointment) => {
      const start = wallClockToInstant(appointment.date, appointment.time, zone);
      return {
        id: id(appointment.id),
        workspace_id: workspaceId,
        customer_id: id(appointment.customerId),
        service_id: appointment.serviceId ? id(appointment.serviceId) : null,
        service_name: appointment.service.name,
        service_price_model: appointment.service.priceModel,
        service_price: appointment.service.price,
        service_duration_min: appointment.service.durationMin,
        scheduled_date: appointment.date,
        scheduled_time: appointment.time,
        scheduled_start: start,
        scheduled_end: new Date(start.getTime() + appointment.service.durationMin * 60_000),
        status: appointment.status,
        source: appointment.source,
        notes: appointment.notes,
        created_at: appointment.createdAt,
        updated_at: appointment.updatedAt,
      };
    })
  );

  await insertMany(
    tx,
    "conversations",
    dataset.conversations.map((conversation) => {
      const started = new Date(conversation.timestamp);
      return {
        id: id(conversation.id),
        workspace_id: workspaceId,
        customer_id: id(conversation.customerId),
        channel: conversation.channel,
        intent: conversation.intent,
        outcome: conversation.outcome,
        started_at: started,
        ended_at: conversation.durationSec
          ? new Date(started.getTime() + conversation.durationSec * 1000)
          : null,
        summary: conversation.summary,
        transcript_preview: conversation.transcriptPreview,
        appointment_id: conversation.appointmentId ? id(conversation.appointmentId) : null,
        created_at: started,
      };
    })
  );

  await insertMany(
    tx,
    "conversation_messages",
    dataset.conversations.flatMap((conversation) =>
      conversation.transcript.map((line, position) => ({
        conversation_id: id(conversation.id),
        position,
        speaker: line.speaker,
        body: line.text,
        offset_label: line.time,
      }))
    )
  );

  await insertMany(
    tx,
    "conversation_actions",
    dataset.conversations.flatMap((conversation) =>
      conversation.actions.map((action, position) => ({
        conversation_id: id(conversation.id),
        position,
        label: action.label,
        done: action.done,
      }))
    )
  );

  await insertMany(
    tx,
    "calls",
    dataset.calls.map((call) => {
      const started = new Date(call.timestamp);
      return {
        id: id(call.id),
        workspace_id: workspaceId,
        conversation_id: id(call.conversationId),
        customer_id: id(call.customerId),
        started_at: started,
        ended_at: new Date(started.getTime() + call.durationSec * 1000),
        duration_sec: call.durationSec,
        status: call.outcome === "missed" ? "missed" : "completed",
        created_at: started,
      };
    })
  );

  await insertMany(
    tx,
    "activity_events",
    dataset.activityEvents.map((event) => ({
      id: id(event.id),
      workspace_id: workspaceId,
      type: event.type,
      occurred_at: event.timestamp,
      customer_id: id(event.customerId),
      channel: event.channel,
      summary: event.summary,
      detail: event.detail,
      conversation_id: event.conversationId ? id(event.conversationId) : null,
      call_id: event.callId ? id(event.callId) : null,
      appointment_id: event.appointmentId ? id(event.appointmentId) : null,
    }))
  );

  await seedNotifications(tx, workspaceId, dataset, now);
}

/**
 * Notifications that describe things actually present in this tenant's data.
 *
 * The previous hard-coded list referred to appointment ids that existed in no
 * dataset, so following a notification led nowhere. These are built from real
 * rows, which is also the only way the "related record" links can work.
 */
async function seedNotifications(tx: Tx, workspaceId: string, dataset: Dataset, now: Date): Promise<void> {
  const id = (value: string) => scoped(workspaceId, value);
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

  const upcoming = dataset.appointments.find((a) => a.status === "confirmed");
  const cancelled = dataset.appointments.find((a) => a.status === "cancelled");
  const escalated = dataset.conversations.find((c) => c.outcome === "escalated");

  const rows: {
    title: string;
    description: string;
    severity: string;
    read: boolean;
    critical: boolean;
    relatedType: string | null;
    relatedId: string | null;
    at: Date;
  }[] = [];

  if (upcoming) {
    rows.push({
      title: "New booking",
      description: `${upcoming.customerName} booked a ${upcoming.service.name} for ${upcoming.date} at ${upcoming.time}.`,
      severity: "success",
      read: false,
      critical: false,
      relatedType: "appointment",
      relatedId: id(upcoming.id),
      at: minutesAgo(2),
    });
  }
  if (cancelled) {
    rows.push({
      title: "Appointment cancelled",
      description: `${cancelled.customerName} cancelled their ${cancelled.service.name}.`,
      severity: "warning",
      read: false,
      critical: false,
      relatedType: "appointment",
      relatedId: id(cancelled.id),
      at: minutesAgo(26),
    });
  }
  if (escalated) {
    rows.push({
      title: "AI could not answer a question",
      description: "A caller asked something the assistant could not resolve. Review the conversation.",
      severity: "critical",
      read: false,
      critical: true,
      relatedType: "conversation",
      relatedId: id(escalated.id),
      at: minutesAgo(60),
    });
  }

  // Matches the seeded integration state below, where the calendar provider is
  // disconnected — a notification and a status that disagree is worse than
  // neither.
  //
  // Worded as a capability, and related to one: this reaches every member of the
  // business, and a business user is never told which vendor sits behind their
  // calendar. The provider name belongs to the admin surfaces.
  rows.push({
    title: "Calendar disconnected",
    description: "Calendar sync stopped working. Reconnect to keep bookings in sync.",
    severity: "critical",
    read: false,
    critical: true,
    relatedType: "integration",
    relatedId: "calendar",
    at: minutesAgo(180),
  });

  for (const [index, row] of rows.entries()) {
    await tx`
      insert into notifications
        (id, workspace_id, title, description, severity, read, critical, related_type, related_id, created_at)
      values
        (${id(`n${index + 1}`)}, ${workspaceId}, ${row.title}, ${row.description}, ${row.severity},
         ${row.read}, ${row.critical}, ${row.relatedType}, ${row.relatedId}, ${row.at})`;
  }
}

async function seedIntegrations(tx: Tx, workspaceId: string, now: Date): Promise<void> {
  for (const record of buildIntegrations(now, workspaceId)) {
    await tx`
      insert into integration_records (
        id, workspace_id, type, provider, display_name, purpose, connection, health,
        last_checked_at, last_successful_sync_at, capabilities, config,
        admin_environment, admin_region, admin_notes, last_error
      ) values (
        ${record.id}, ${workspaceId}, ${record.type}, ${record.provider}, ${record.displayName},
        ${record.purpose}, ${record.connection}, ${record.health},
        ${record.lastCheckedAt}, ${record.lastSuccessfulSyncAt},
        ${tx.json(record.capabilities as never)},
        ${tx.json(sanitizeConfig(record.config) as never)},
        ${record.admin.environment}, ${record.admin.region ?? null}, ${record.admin.notes ?? null},
        ${record.lastError === null ? null : tx.json(record.lastError as never)}
      )`;
  }

  for (const workflow of buildWorkflows(now, workspaceId)) {
    await tx`
      insert into workflow_mappings (
        id, workspace_id, name, capability, operation, workflow_ref, version, environment, status,
        last_execution_at, last_success_at, failed_executions
      ) values (
        ${workflow.id}, ${workspaceId}, ${workflow.name}, ${workflow.capability}, ${workflow.operation},
        ${workflow.workflowRef},
        ${workflow.version}, ${workflow.environment}, ${workflow.status},
        ${workflow.lastExecutionAt}, ${workflow.lastSuccessAt}, ${workflow.failedExecutions}
      )`;
  }

  for (const event of buildEvents(now, workspaceId)) {
    await tx`
      insert into integration_events (id, workspace_id, provider, type, message, severity, occurred_at)
      values (${event.id}, ${workspaceId}, ${event.provider}, ${event.type}, ${event.message},
              ${event.severity}, ${event.timestamp})`;
  }

  // A messaging number per workspace.
  //
  // Not decoration: inbound SMS resolves its tenant from this table and nothing
  // else, so a workspace without a row can receive nothing. Seeding one keeps
  // the simulated inbound path exercisable by clicking around, and gives the
  // two tenants *different* numbers — which is what makes the cross-tenant
  // tests meaningful rather than vacuous.
  //
  // Numbers are from the North American 555-01xx fictional range, which is
  // reserved precisely so demo data cannot dial a real person.
  const line = workspaceId === DEV_WORKSPACE_A ? "+15550101001" : "+15550101002";
  await tx`
    insert into provider_phone_numbers (id, workspace_id, provider, phone_number, label, sms_enabled)
    values (${`pnum_seed_${workspaceId}`}, ${workspaceId}, 'twilio', ${line}, 'Main line', true)`;
}

async function seedAudit(tx: Tx): Promise<void> {
  for (const event of DEV_AUDIT) {
    await tx`
      insert into audit_events
        (id, actor_user_id, workspace_id, action, target_type, target_id, occurred_at, metadata)
      values
        (${event.id}, ${event.actorUserId}, ${event.workspaceId}, ${event.action},
         ${event.targetType}, ${event.targetId}, ${event.timestamp}, ${tx.json(event.metadata as never)})`;
  }
}
