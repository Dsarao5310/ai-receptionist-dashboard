import "server-only";

import type { AuthContext } from "@/server/auth/policy";
import { getDb, type Sql } from "./client";
import { AppointmentRepository } from "./repositories/appointments";
import { ActivityRepository } from "./repositories/activity";
import { CallRepository } from "./repositories/calls";
import { ConfigurationRepository } from "./repositories/configuration";
import { ConversationRepository } from "./repositories/conversations";
import { CustomerRepository } from "./repositories/customers";
import { IntegrationRepository } from "./repositories/integrations";
import { MessagingRepository } from "./repositories/messaging";
import { NotificationRepository } from "./repositories/notifications";
import { OrchestrationRepository } from "./repositories/orchestration";
import { SettingsRepository } from "./repositories/settings";
import { WorkspaceRepository } from "./repositories/workspaces";

/**
 * Tenant data, reachable only through an authorized workspace.
 *
 * ── The shape of the guarantee ──────────────────────────────────────────────
 * There is no `getAppointment(id)` anywhere in this codebase. Every query that
 * touches tenant data is issued by a repository that already holds a workspace
 * id, and the only way to obtain one of those repositories is to hand this
 * function an `AuthContext` — which can only be produced by `authorizeWorkspace`,
 * which resolved it from a verified session and a membership lookup.
 *
 * So the dangerous mistake is not merely discouraged, it is unspellable. A
 * caller cannot forget the `where workspace_id = …` clause, because the clause
 * is not theirs to write:
 *
 *     const scope = await workspaceScope(context);
 *     await scope.appointments.findById(id);   // scoped, always
 *
 * An id belonging to another tenant simply does not resolve. There is no
 * variant of that call which searches globally and checks ownership afterwards
 * — the pattern that produces IDOR bugs — because no such method exists.
 *
 * ── Why a context and not a string ──────────────────────────────────────────
 * Taking `workspaceId: string` would make the type system indifferent to where
 * the value came from, and a value from a request body looks exactly like one
 * from a membership check. Taking `AuthContext` means the compiler asks "who
 * authorized this?" at every call site.
 */
export interface WorkspaceScope {
  /** The authorized workspace. Every query below is bound to it. */
  readonly workspaceId: string;
  readonly context: AuthContext;

  readonly workspace: WorkspaceRepository;
  readonly configuration: ConfigurationRepository;
  readonly customers: CustomerRepository;
  readonly conversations: ConversationRepository;
  readonly calls: CallRepository;
  readonly appointments: AppointmentRepository;
  readonly activity: ActivityRepository;
  readonly notifications: NotificationRepository;
  readonly integrations: IntegrationRepository;
  readonly messaging: MessagingRepository;
  readonly orchestration: OrchestrationRepository;
  readonly settings: SettingsRepository;
}

export function workspaceScope(context: AuthContext, sql: Sql = getDb()): WorkspaceScope {
  const workspaceId = context.workspaceId;

  return {
    workspaceId,
    context,
    workspace: new WorkspaceRepository(sql, workspaceId),
    configuration: new ConfigurationRepository(sql, workspaceId),
    customers: new CustomerRepository(sql, workspaceId),
    conversations: new ConversationRepository(sql, workspaceId),
    calls: new CallRepository(sql, workspaceId),
    appointments: new AppointmentRepository(sql, workspaceId),
    activity: new ActivityRepository(sql, workspaceId),
    notifications: new NotificationRepository(sql, workspaceId),
    integrations: new IntegrationRepository(sql, workspaceId),
    messaging: new MessagingRepository(sql, workspaceId),
    orchestration: new OrchestrationRepository(sql, workspaceId),
    settings: new SettingsRepository(sql, workspaceId),
  };
}
