import type { IntegrationEvent, IntegrationRecord, Workspace, WorkflowMapping } from "@/types";
import { DEV_WORKSPACE_A, DEV_WORKSPACE_B } from "@/data/workspace-ids";

/**
 * Seed integration state for the demo workspace.
 *
 * Deliberately not all-green: a healthy calendar would leave the "needs
 * attention" path, the degraded-capability derivation and the reconnect flow
 * untested by anyone clicking around. Google Calendar starts disconnected,
 * which is also what the seeded notification says, so the two agree.
 *
 * Timestamps are fixed offsets from generation time rather than hard-coded
 * dates, so the demo never looks stale. They are absolute instants; anything
 * asking "which business day was that?" resolves them through the business
 * timezone, as everywhere else.
 */

const hoursAgo = (now: Date, h: number) => new Date(now.getTime() - h * 3600_000).toISOString();
const minutesAgo = (now: Date, m: number) => new Date(now.getTime() - m * 60_000).toISOString();

export function buildWorkspaces(now: Date): Workspace[] {
  return [
    {
      id: DEV_WORKSPACE_A,
      name: "Coastal Bloom Salon",
      businessName: "Coastal Bloom Salon",
      tier: "professional",
      createdAt: new Date(now.getTime() - 210 * 86400_000).toISOString(),
      featureFlags: {
        "analytics.peak_times": true,
        "receptionist.voice_preview": false,
        "knowledge.auto_suggest": false,
      },
      usage: {
        conversationsThisPeriod: 412,
        conversationsIncluded: 1000,
        minutesThisPeriod: 638,
        minutesIncluded: 1500,
      },
      internalNotes: "Migrated from the trial plan in March. Owner prefers SMS follow-ups.",
    },
    {
      id: DEV_WORKSPACE_B,
      name: "Harbour Dental",
      businessName: "Harbour Dental",
      tier: "starter",
      createdAt: new Date(now.getTime() - 40 * 86400_000).toISOString(),
      featureFlags: {
        "analytics.peak_times": true,
        "receptionist.voice_preview": false,
        "knowledge.auto_suggest": false,
      },
      usage: {
        conversationsThisPeriod: 96,
        conversationsIncluded: 300,
        minutesThisPeriod: 142,
        minutesIncluded: 400,
      },
      internalNotes: "Onboarding in progress. Calendar not yet authorised.",
    },
  ];
}

export function buildIntegrations(now: Date, workspaceId: string): IntegrationRecord[] {
  return [
    {
      id: `${workspaceId}__vapi`,
      workspaceId,
      type: "voice",
      provider: "vapi",
      displayName: "Vapi",
      purpose: "Voice AI infrastructure — answers and holds phone conversations.",
      connection: "connected",
      health: "healthy",
      lastCheckedAt: minutesAgo(now, 6),
      lastSuccessfulSyncAt: minutesAgo(now, 6),
      capabilities: [
        { key: "inbound_calls", label: "Answer inbound calls", enabled: true },
        { key: "transcription", label: "Live transcription", enabled: true },
        { key: "outbound_calls", label: "Place outbound calls", enabled: false },
      ],
      config: [
        { key: "assistant", label: "Assistant", state: "configured", value: "Coastal Bloom receptionist", sensitive: false },
        { key: "phone_number", label: "Phone connection", state: "configured", value: "+1 (604) 555-0142", sensitive: false },
        { key: "api_key", label: "API credential", state: "configured", sensitive: true },
      ],
      admin: { environment: "production", region: "us-west", notes: "Assistant rebuilt after the July prompt change." },
      lastError: null,
    },
    {
      id: `${workspaceId}__twilio`,
      workspaceId,
      type: "sms",
      provider: "twilio",
      displayName: "Twilio",
      purpose: "SMS and telephony — carries text conversations and call routing.",
      connection: "connected",
      health: "healthy",
      lastCheckedAt: minutesAgo(now, 12),
      lastSuccessfulSyncAt: minutesAgo(now, 12),
      capabilities: [
        { key: "inbound_sms", label: "Receive SMS", enabled: true },
        { key: "outbound_sms", label: "Send SMS", enabled: true },
        { key: "mms", label: "Picture messaging", enabled: false },
      ],
      config: [
        { key: "phone_number", label: "SMS number", state: "configured", value: "+1 (604) 555-0142", sensitive: false },
        { key: "messaging_service", label: "Messaging service", state: "configured", value: "Coastal Bloom", sensitive: false },
        { key: "auth_token", label: "Auth credential", state: "configured", sensitive: true },
      ],
      admin: { environment: "production", region: "us-west" },
      lastError: null,
    },
    {
      id: `${workspaceId}__google_calendar`,
      workspaceId,
      type: "calendar",
      provider: "google_calendar",
      displayName: "Google Calendar",
      purpose: "Scheduling — writes confirmed bookings to the business calendar.",
      // The two seeded businesses are deliberately in different states. One has
      // a working calendar so the connected path, the timezone mismatch and the
      // reconciliation queue are all visible without setting anything up; the
      // other has an expired authorisation, which keeps the degraded path and
      // the reconnect flow exercised by anyone clicking around.
      ...(workspaceId === DEV_WORKSPACE_B
        ? {
            connection: "connected" as const,
            health: "healthy" as const,
            lastCheckedAt: minutesAgo(now, 9),
            lastSuccessfulSyncAt: minutesAgo(now, 9),
            capabilities: [
              { key: "read_events", label: "Read existing events", enabled: true },
              { key: "write_events", label: "Create bookings", enabled: true },
              { key: "free_busy", label: "Check availability", enabled: true },
            ],
            config: [
              { key: "account", label: "Connected account", state: "configured" as const, value: "bookings@harbourdental.example", sensitive: false },
              { key: "calendar", label: "Target calendar", state: "configured" as const, value: "Business calendar", sensitive: false },
              { key: "calendar_id", label: "Calendar identifier", state: "configured" as const, value: "primary", sensitive: false },
              // Vancouver, while Harbour Dental operates in Toronto: the
              // mismatch case is the seeded default because it is the one that
              // hides bugs.
              { key: "calendar_timezone", label: "Calendar timezone", state: "configured" as const, value: "America/Vancouver", sensitive: false },
              { key: "oauth", label: "Authorisation", state: "configured" as const, sensitive: true },
            ],
            admin: { environment: "production" as const },
            lastError: null,
          }
        : {
            connection: "disconnected" as const,
            health: "unknown" as const,
            lastCheckedAt: hoursAgo(now, 3),
            lastSuccessfulSyncAt: hoursAgo(now, 27),
            capabilities: [
              { key: "read_events", label: "Read existing events", enabled: false },
              { key: "write_events", label: "Create bookings", enabled: false },
              { key: "free_busy", label: "Check availability", enabled: false },
            ],
            config: [
              { key: "account", label: "Connected account", state: "not_configured" as const, sensitive: false },
              { key: "calendar", label: "Target calendar", state: "not_configured" as const, sensitive: false },
              { key: "calendar_id", label: "Calendar identifier", state: "not_configured" as const, sensitive: false },
              { key: "calendar_timezone", label: "Calendar timezone", state: "not_configured" as const, sensitive: false },
              { key: "oauth", label: "Authorisation", state: "not_configured" as const, sensitive: true },
            ],
            admin: { environment: "production" as const, notes: "Authorisation expired; owner needs to re-consent." },
            lastError: {
              code: "calendar_auth_expired",
              category: "auth" as const,
              severity: "critical" as const,
              message: "The calendar connection needs to be authorised again.",
              adminDetail: "Stored authorisation was rejected on the last scheduled check.",
              provider: "google_calendar" as const,
              timestamp: hoursAgo(now, 3),
              retryable: false,
            },
          }),
    },
    {
      id: `${workspaceId}__gmail`,
      workspaceId,
      type: "email",
      provider: "gmail",
      displayName: "Gmail",
      purpose: "Email channel — receives and replies to customer email.",
      connection: "connected",
      health: "degraded",
      lastCheckedAt: minutesAgo(now, 25),
      lastSuccessfulSyncAt: hoursAgo(now, 5),
      capabilities: [
        { key: "read_mail", label: "Read incoming mail", enabled: true },
        { key: "send_mail", label: "Send replies", enabled: true },
        { key: "labels", label: "Apply labels", enabled: false },
      ],
      config: [
        { key: "mailbox", label: "Connected mailbox", state: "configured", value: "hello@coastalbloom.example", sensitive: false },
        { key: "oauth", label: "Authorisation", state: "configured", sensitive: true },
      ],
      admin: { environment: "production" },
      lastError: {
        code: "email_sync_slow",
        category: "rate_limit",
        severity: "warning",
        message: "Email is being checked less often than usual.",
        adminDetail: "Provider is rate limiting scheduled polls; backing off automatically.",
        provider: "gmail",
        timestamp: minutesAgo(now, 25),
        retryable: true,
      },
    },
    {
      id: `${workspaceId}__n8n`,
      workspaceId,
      type: "workflow",
      provider: "n8n",
      displayName: "n8n",
      purpose: "Automation engine — runs the workflows behind every channel.",
      connection: "connected",
      health: "healthy",
      lastCheckedAt: minutesAgo(now, 4),
      lastSuccessfulSyncAt: minutesAgo(now, 4),
      capabilities: [
        { key: "execute", label: "Run workflows", enabled: true },
        { key: "history", label: "Read execution history", enabled: true },
      ],
      config: [
        { key: "instance", label: "Instance", state: "configured", value: "Production", sensitive: false },
        { key: "credential", label: "Access credential", state: "configured", sensitive: true },
      ],
      admin: { environment: "production", region: "us-west" },
      lastError: null,
    },
    {
      id: `${workspaceId}__pinecone`,
      workspaceId,
      type: "knowledge",
      provider: "pinecone",
      displayName: "Pinecone",
      purpose: "Knowledge retrieval — what the receptionist can look up when answering.",
      connection: "connected",
      health: "healthy",
      lastCheckedAt: minutesAgo(now, 40),
      lastSuccessfulSyncAt: minutesAgo(now, 40),
      capabilities: [
        { key: "search", label: "Answer from business knowledge", enabled: true },
        { key: "reindex", label: "Rebuild the knowledge index", enabled: true },
      ],
      config: [
        { key: "index", label: "Index", state: "configured", value: "coastal-bloom", sensitive: false },
        { key: "namespace", label: "Namespace", state: "configured", value: "production", sensitive: false },
        { key: "api_key", label: "API credential", state: "configured", sensitive: true },
      ],
      admin: { environment: "production", region: "us-west" },
      lastError: null,
    },
    {
      id: `${workspaceId}__model_provider`,
      workspaceId,
      type: "model",
      provider: "model_provider",
      displayName: "Language model",
      purpose: "The model that composes what the receptionist says.",
      connection: "connected",
      health: "healthy",
      lastCheckedAt: minutesAgo(now, 8),
      lastSuccessfulSyncAt: minutesAgo(now, 8),
      capabilities: [
        { key: "chat", label: "Compose replies", enabled: true },
        { key: "summarise", label: "Summarise conversations", enabled: true },
      ],
      config: [
        { key: "model", label: "Model", state: "configured", value: "Configured by Anthropic", sensitive: false },
        { key: "api_key", label: "API credential", state: "configured", sensitive: true },
      ],
      admin: { environment: "production" },
      lastError: null,
    },
  ];
}

/**
 * Workflow assignments for a seeded workspace.
 *
 * `workflowRef` is suffixed per workspace because a workflow reference is a
 * tenant identity: it is what an inbound event is attributed by, and the
 * database now enforces that it names exactly one workspace. Two businesses
 * sharing `wf_calendar_sync_v2` would make "whose booking is this?" ambiguous.
 *
 * The calendar sync workflow is deliberately left in `error` state so the
 * degraded path stays exercised by anyone clicking around.
 */
export function buildWorkflows(now: Date, workspaceId: string): WorkflowMapping[] {
  const ref = (name: string) => `${name}__${workspaceId}`;

  return [
    {
      id: `${workspaceId}__wf_voice`,
      workspaceId,
      name: "Inbound call handling",
      capability: "voice",
      operation: null,
      workflowRef: ref("wf_inbound_voice_v4"),
      version: "4.2.0",
      environment: "production",
      status: "active",
      lastExecutionAt: minutesAgo(now, 18),
      lastSuccessAt: minutesAgo(now, 18),
      failedExecutions: 0,
    },
    {
      id: `${workspaceId}__wf_sms`,
      workspaceId,
      name: "SMS conversation handling",
      capability: "sms",
      operation: "customer.message",
      workflowRef: ref("wf_sms_thread_v3"),
      version: "3.1.1",
      environment: "production",
      status: "active",
      lastExecutionAt: minutesAgo(now, 52),
      lastSuccessAt: minutesAgo(now, 52),
      failedExecutions: 0,
    },
    {
      id: `${workspaceId}__wf_calendar`,
      workspaceId,
      name: "Booking to calendar sync",
      capability: "calendar",
      operation: "appointment.book",
      workflowRef: ref("wf_calendar_sync_v2"),
      version: "2.7.3",
      environment: "production",
      status: "error",
      lastExecutionAt: hoursAgo(now, 3),
      lastSuccessAt: hoursAgo(now, 27),
      failedExecutions: 9,
    },
    {
      id: `${workspaceId}__wf_reschedule`,
      workspaceId,
      name: "Appointment reschedule",
      capability: "calendar",
      operation: "appointment.reschedule",
      workflowRef: ref("wf_appointment_reschedule_v1"),
      version: "1.4.0",
      environment: "production",
      status: "active",
      lastExecutionAt: hoursAgo(now, 2),
      lastSuccessAt: hoursAgo(now, 2),
      failedExecutions: 0,
    },
    {
      id: `${workspaceId}__wf_cancel`,
      workspaceId,
      name: "Appointment cancellation",
      capability: "calendar",
      operation: "appointment.cancel",
      workflowRef: ref("wf_appointment_cancel_v1"),
      version: "1.2.0",
      environment: "production",
      status: "active",
      lastExecutionAt: hoursAgo(now, 9),
      lastSuccessAt: hoursAgo(now, 9),
      failedExecutions: 0,
    },
    {
      id: `${workspaceId}__wf_email`,
      workspaceId,
      name: "Email triage and reply",
      capability: "email",
      operation: null,
      workflowRef: ref("wf_email_triage_v2"),
      version: "2.0.4",
      environment: "production",
      status: "active",
      lastExecutionAt: hoursAgo(now, 5),
      lastSuccessAt: hoursAgo(now, 5),
      failedExecutions: 2,
    },
  ];
}

export function buildEvents(now: Date, workspaceId: string): IntegrationEvent[] {
  return [
    {
      id: `${workspaceId}__ev_1`,
      workspaceId,
      provider: "google_calendar",
      type: "sync_failed",
      message: "Calendar sync stopped — authorisation was rejected.",
      severity: "critical",
      timestamp: hoursAgo(now, 3),
    },
    {
      id: `${workspaceId}__ev_2`,
      workspaceId,
      provider: "google_calendar",
      type: "disconnected",
      message: "Google Calendar was marked disconnected after repeated failures.",
      severity: "critical",
      timestamp: hoursAgo(now, 3),
    },
    {
      id: `${workspaceId}__ev_3`,
      workspaceId,
      provider: "gmail",
      type: "test_failed",
      message: "Scheduled check was rate limited by the provider.",
      severity: "warning",
      timestamp: minutesAgo(now, 25),
    },
    {
      id: `${workspaceId}__ev_4`,
      workspaceId,
      provider: "n8n",
      type: "workflow_failed",
      message: "Booking to calendar sync failed — depends on the calendar connection.",
      severity: "warning",
      timestamp: hoursAgo(now, 3),
    },
    {
      id: `${workspaceId}__ev_5`,
      workspaceId,
      provider: "vapi",
      type: "test_passed",
      message: "Connection test passed.",
      severity: "info",
      timestamp: minutesAgo(now, 6),
    },
    {
      id: `${workspaceId}__ev_6`,
      workspaceId,
      provider: "twilio",
      type: "recovered",
      message: "SMS delivery recovered after a brief provider incident.",
      severity: "info",
      timestamp: hoursAgo(now, 19),
    },
  ];
}
