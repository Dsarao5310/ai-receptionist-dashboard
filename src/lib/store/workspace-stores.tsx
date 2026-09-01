"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type {
  AIConfiguration,
  AppConfiguration,
  AppNotification,
  BusinessIdentity,
  BusinessService,
  DateRangeKey,
  DayHours,
  IntegrationEvent,
  IntegrationRecord,
  KnowledgeEntry,
  SpecialHours,
  WorkflowMapping,
  TestResult,
  Workspace,
} from "@/types";
import type { AuthenticatedSession } from "@/types/identity";
import type { WorkspaceDashboardData } from "@/server/workspace-data";
import type { CapabilityStatusEntry } from "@/services/integrations";
import { toast } from "./toast";
import {
  addKnowledgeAction,
  addServiceAction,
  addSpecialHoursAction,
  moveServiceAction,
  removeKnowledgeAction,
  removeServiceAction,
  removeSpecialHoursAction,
  updateAIAction,
  updateBusinessAction,
  updateHoursAction,
  updateKnowledgeAction,
  updateServiceAction,
  updateSpecialHoursAction,
} from "@/server/actions/configuration";
import {
  connectIntegrationAction,
  disconnectIntegrationAction,
  setFeatureFlagAction,
  setWorkspaceNotesAction,
  testIntegrationAction,
} from "@/server/actions/integrations";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
  updateAccountAction,
  updateDashboardSettingsAction,
  updateNotificationPreferenceAction,
} from "@/server/actions/workspace-settings";

/**
 * Workspace state in the browser, held in React context.
 *
 * ── Why context and not a module-level store ────────────────────────────────
 * This state used to live in four zustand stores created at module scope. That
 * was fine while the data was generated per browser, and became unsafe the
 * moment it came from a database, for a reason that is easy to miss: client
 * components are rendered on the *server* during SSR, and a module-level store
 * is one object shared by every request that server handles. Two tenants
 * rendering concurrently would have been reading and writing the same object.
 *
 * Context has no such problem. It is created per render tree, so one request's
 * data cannot be visible to another's — the isolation is structural rather than
 * something the code has to remember.
 *
 * It also removed a whole class of hydration bug. The stores previously read
 * from local storage during creation, so the first client render disagreed with
 * the server's, and three mechanisms existed to manage that (`skipHydration`,
 * deferred rehydration, skeletons until it finished). With one source of truth
 * passed as props, server and client render the same markup from the same
 * values and there is nothing to reconcile.
 *
 * ── The hook shapes are unchanged ───────────────────────────────────────────
 * `useConfiguration()` and `useConfiguration((s) => s.business.timezone)` both
 * still work, as do the equivalents for the other three. Roughly thirty call
 * sites depend on that, and none of them needed to change: what moved is where
 * the data lives, not how it is read.
 *
 * ── Optimistic, never authoritative ─────────────────────────────────────────
 * Every mutation applies locally so the interface responds at once, then calls
 * a server action that authorizes, validates and writes. A refusal rolls the
 * local change back and says why. The browser never keeps a change the server
 * declined.
 */

// ── Slice shapes ────────────────────────────────────────────────────────────

/**
 * Every optimistic write here resolves to whether the *server* actually
 * accepted it, not just whether the local state update ran — a caller that
 * shows its own success toast right after calling one of these needs to
 * await that answer first. Firing a success toast unconditionally on the
 * synchronous return (the previous shape of every method here) meant a real
 * server failure showed a false "saved" toast immediately followed by this
 * store's own rollback-triggered "Couldn't save" toast — a genuinely
 * confusing, contradictory sequence, not just a missed nicety.
 */
export interface ConfigurationState extends AppConfiguration {
  updateBusiness: (patch: Partial<BusinessIdentity>) => Promise<boolean>;
  updateHours: (hours: DayHours[]) => Promise<boolean>;
  addSpecialHours: (entry: Omit<SpecialHours, "id">) => Promise<boolean>;
  updateSpecialHours: (id: string, patch: Partial<Omit<SpecialHours, "id">>) => Promise<boolean>;
  removeSpecialHours: (id: string) => Promise<boolean>;
  addService: (service: Omit<BusinessService, "id">) => Promise<boolean>;
  updateService: (id: string, patch: Partial<Omit<BusinessService, "id">>) => Promise<boolean>;
  removeService: (id: string) => Promise<boolean>;
  moveService: (id: string, direction: -1 | 1) => Promise<boolean>;
  addKnowledge: (entry: Omit<KnowledgeEntry, "id">) => Promise<{ saved: boolean; warning?: string }>;
  updateKnowledge: (id: string, patch: Partial<Omit<KnowledgeEntry, "id">>) => Promise<{ saved: boolean; warning?: string }>;
  removeKnowledge: (id: string) => Promise<{ saved: boolean; warning?: string }>;
  updateAI: (patch: Partial<AIConfiguration>) => Promise<boolean>;
}

export interface IntegrationsState {
  workspaces: Workspace[];
  /**
   * What the business can do, named as capabilities. Present for every role.
   */
  capabilities: CapabilityStatusEntry[];
  /** When those capabilities were last verified. */
  checkedAt: string | null;
  /**
   * Provider records. Empty for anyone without `integrations.view` — the
   * server does not send them, so there is nothing here to hide.
   */
  integrations: IntegrationRecord[];
  workflows: WorkflowMapping[];
  events: IntegrationEvent[];
  /** Ids currently mid-operation, so cards can show per-item progress. */
  pending: string[];
  connect: (id: string) => Promise<void>;
  disconnect: (id: string) => Promise<void>;
  testConnection: (id: string) => Promise<TestResult | null>;
  setInternalNotes: (workspaceId: string, notes: string) => Promise<boolean>;
  setFeatureFlag: (workspaceId: string, flag: string, enabled: boolean) => void;
}

export interface NotificationsState {
  notifications: AppNotification[];
  markRead: (id: string) => void;
  markAllRead: () => void;
}

export type NotificationEventKey =
  | "appointment_booked"
  | "appointment_cancelled"
  | "appointment_rescheduled"
  | "integration_problem"
  | "ai_could_not_answer"
  | "high_missed_calls";

export interface NotificationChannels {
  inApp: boolean;
  email: boolean;
  sms: boolean;
}

export type TimestampStyle = "relative" | "exact";

export interface SettingsState {
  account: { name: string; email: string; jobTitle: string };
  notifications: Record<NotificationEventKey, NotificationChannels>;
  dashboard: { landingPage: string; defaultRange: DateRangeKey; timestampStyle: TimestampStyle };
  setAccount: (patch: Partial<SettingsState["account"]>) => Promise<boolean>;
  setNotification: (key: NotificationEventKey, channel: keyof NotificationChannels, value: boolean) => void;
  setDashboard: (patch: Partial<SettingsState["dashboard"]>) => void;
}

interface WorkspaceStores {
  configuration: ConfigurationState;
  integrations: IntegrationsState;
  notifications: NotificationsState;
  settings: SettingsState;
  /** False until the server's data has arrived, so views can show skeletons. */
  ready: boolean;
}

const WorkspaceStoresContext = React.createContext<WorkspaceStores | null>(null);

// ── Provider ────────────────────────────────────────────────────────────────

/** Ids for optimistically-added rows, replaced by the server's on the next read. */
function draftId(prefix: string) {
  return `${prefix}_pending_${Math.random().toString(36).slice(2, 8)}`;
}

interface MutableState {
  configuration: AppConfiguration;
  integrations: Pick<IntegrationsState, "workspaces" | "capabilities" | "checkedAt" | "integrations" | "workflows" | "events" | "pending">;
  notifications: AppNotification[];
  settings: Pick<SettingsState, "account" | "notifications" | "dashboard">;
}

function build(data: WorkspaceDashboardData, session: AuthenticatedSession): MutableState {
  return {
    configuration: data.configuration,
    integrations: {
      workspaces: [data.workspace],
      capabilities: data.capabilities,
      checkedAt: data.capabilitiesCheckedAt,
      integrations: data.integrations,
      workflows: data.workflows,
      events: data.integrationEvents,
      pending: [],
    },
    notifications: data.notifications,
    settings: {
      account: {
        name: session.user.name,
        email: session.user.email,
        jobTitle: data.account.jobTitle,
      },
      notifications: data.settings.notifications,
      dashboard: data.settings.dashboard,
    },
  };
}

export function WorkspaceStoresProvider({
  data,
  session,
  children,
}: {
  data: WorkspaceDashboardData | null;
  session: AuthenticatedSession | null;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const ready = Boolean(data && session);

  const [state, setState] = React.useState<MutableState | null>(() =>
    data && session ? build(data, session) : null
  );

  /**
   * Re-derive from props when the server sends a different payload — a
   * workspace switch, or a revalidation after a write.
   *
   * Done during render rather than in an effect on purpose. An effect runs
   * after the first paint, which on a workspace switch would put the *previous*
   * tenant's records on screen under the new tenant's name for a frame. Setting
   * state during render of the same component is React's supported way to say
   * "this state is derived from props": it re-renders before anything is shown.
   */
  const key = data ? `${data.workspace.id}:${data.dataset.generatedAt}` : null;
  const [seededKey, setSeededKey] = React.useState(key);
  if (data && session && key !== seededKey) {
    setSeededKey(key);
    setState(build(data, session));
  }

  /**
   * Apply locally, ask the server, roll back on refusal.
   *
   * The rollback restores the configuration as it was immediately before this
   * change, captured inside the state updater so it reflects any concurrent
   * edit rather than a value read earlier.
   */
  const commitConfiguration = React.useCallback(
    async (
      optimistic: (previous: AppConfiguration) => AppConfiguration,
      call: () => Promise<{ ok: boolean; error?: string }>,
      description: string
    ): Promise<boolean> => {
      let rollback: AppConfiguration | null = null;
      setState((s) => {
        if (!s) return s;
        rollback = s.configuration;
        return { ...s, configuration: optimistic(s.configuration) };
      });

      const result = await call();
      if (!result.ok) {
        const previous = rollback;
        if (previous) setState((s) => (s ? { ...s, configuration: previous } : s));
        toast(`Couldn't save ${description}`, { description: result.error });
        return false;
      }
      router.refresh();
      return true;
    },
    [router]
  );

  const commitKnowledge = React.useCallback(
    async (
      optimistic: (previous: AppConfiguration) => AppConfiguration,
      call: () => Promise<{ ok: boolean; error?: string; warning?: string }>,
      description: string
    ): Promise<{ saved: boolean; warning?: string }> => {
      let rollback: AppConfiguration | null = null;
      setState((s) => {
        if (!s) return s;
        rollback = s.configuration;
        return { ...s, configuration: optimistic(s.configuration) };
      });

      const result = await call();
      if (!result.ok) {
        const previous = rollback;
        if (previous) setState((s) => (s ? { ...s, configuration: previous } : s));
        toast(`Couldn't save ${description}`, { description: result.error });
        return { saved: false };
      }
      router.refresh();
      if (result.warning) {
        toast("Knowledge saved, but synchronization needs attention", {
          description: result.warning,
        });
        return { saved: true, warning: result.warning };
      }
      return { saved: true };
    },
    [router]
  );

  const stores = React.useMemo<WorkspaceStores>(() => {
    const configuration = state?.configuration ?? EMPTY_CONFIGURATION;
    const integrations = state?.integrations ?? EMPTY_INTEGRATIONS;
    const settings = state?.settings ?? EMPTY_SETTINGS;

    return {
      ready,

      configuration: {
        ...configuration,

        updateBusiness: (patch) =>
          commitConfiguration(
            (c) => ({ ...c, business: { ...c.business, ...patch } }),
            () => updateBusinessAction(patch),
            "your business details"
          ),

        updateHours: (hours) =>
          commitConfiguration(
            (c) => ({ ...c, hours }),
            () => updateHoursAction(hours),
            "your opening hours"
          ),

        addSpecialHours: (entry) =>
          commitConfiguration(
            (c) => ({
              ...c,
              specialHours: [...c.specialHours, { ...entry, id: draftId("sh") }].sort((a, b) =>
                a.date.localeCompare(b.date)
              ),
            }),
            () => addSpecialHoursAction(entry),
            "that date"
          ),

        updateSpecialHours: (id, patch) =>
          commitConfiguration(
            (c) => ({
              ...c,
              specialHours: c.specialHours
                .map((e) => (e.id === id ? { ...e, ...patch } : e))
                .sort((a, b) => a.date.localeCompare(b.date)),
            }),
            () => updateSpecialHoursAction(id, patch),
            "that date"
          ),

        removeSpecialHours: (id) =>
          commitConfiguration(
            (c) => ({ ...c, specialHours: c.specialHours.filter((e) => e.id !== id) }),
            () => removeSpecialHoursAction(id),
            "that change"
          ),

        addService: (service) =>
          commitConfiguration(
            (c) => ({ ...c, services: [...c.services, { ...service, id: draftId("svc") }] }),
            () => addServiceAction(service),
            `“${service.name}”`
          ),

        updateService: (id, patch) =>
          commitConfiguration(
            (c) => ({ ...c, services: c.services.map((s) => (s.id === id ? { ...s, ...patch } : s)) }),
            () => updateServiceAction(id, patch),
            "that service"
          ),

        removeService: (id) =>
          commitConfiguration(
            (c) => ({ ...c, services: c.services.filter((s) => s.id !== id) }),
            () => removeServiceAction(id),
            "that change"
          ),

        moveService: (id, direction) =>
          commitConfiguration(
            (c) => {
              const index = c.services.findIndex((s) => s.id === id);
              const target = index + direction;
              if (index < 0 || target < 0 || target >= c.services.length) return c;
              const next = [...c.services];
              [next[index], next[target]] = [next[target], next[index]];
              return { ...c, services: next };
            },
            () => moveServiceAction(id, direction),
            "that order"
          ),

        addKnowledge: (entry) =>
          commitKnowledge(
            (c) => ({ ...c, knowledge: [...c.knowledge, { ...entry, id: draftId("kn") }] }),
            () => addKnowledgeAction(entry),
            "that answer"
          ),

        updateKnowledge: (id, patch) =>
          commitKnowledge(
            (c) => ({ ...c, knowledge: c.knowledge.map((k) => (k.id === id ? { ...k, ...patch } : k)) }),
            () => updateKnowledgeAction(id, patch),
            "that answer"
          ),

        removeKnowledge: (id) =>
          commitKnowledge(
            (c) => ({ ...c, knowledge: c.knowledge.filter((k) => k.id !== id) }),
            () => removeKnowledgeAction(id),
            "that change"
          ),

        updateAI: (patch) =>
          commitConfiguration(
            (c) => ({ ...c, ai: { ...c.ai, ...patch } }),
            () => updateAIAction(patch),
            "your receptionist settings"
          ),
      },

      integrations: {
        ...integrations,

        async connect(id) {
          setState((s) =>
            s
              ? {
                  ...s,
                  integrations: {
                    ...s.integrations,
                    pending: [...s.integrations.pending, id],
                    // A visible intermediate state, so "Connecting" is something
                    // people see rather than something the code passes through.
                    integrations: s.integrations.integrations.map((r) =>
                      r.id === id ? { ...r, connection: "connecting" } : r
                    ),
                  },
                }
              : s
          );

          const result = await connectIntegrationAction(id);
          applyIntegrationResult(setState, id, result);
          if (result.ok) router.refresh();
          else toast("Couldn't connect", { description: result.error });
        },

        async disconnect(id) {
          setState((s) =>
            s ? { ...s, integrations: { ...s.integrations, pending: [...s.integrations.pending, id] } } : s
          );
          const result = await disconnectIntegrationAction(id);
          applyIntegrationResult(setState, id, result);
          if (result.ok) router.refresh();
          else toast("Couldn't disconnect", { description: result.error });
        },

        async testConnection(id) {
          setState((s) =>
            s ? { ...s, integrations: { ...s.integrations, pending: [...s.integrations.pending, id] } } : s
          );
          const result = await testIntegrationAction(id);
          applyIntegrationResult(setState, id, result);
          if (!result.ok) {
            toast("Couldn't run the test", { description: result.error });
            return null;
          }
          router.refresh();
          return result.result;
        },

        async setInternalNotes(workspaceId, internalNotes) {
          // Same "apply locally, ask the server, roll back on refusal" shape as
          // `commitConfiguration` above — without the rollback, a refused save left
          // the optimistic notes in state while the SaveBar (driven by that same
          // state) read them as already-matching and disappeared, so the failure
          // toast and the form's own "nothing to save" state contradicted each other.
          let rollback: string | undefined;
          setState((s) => {
            if (!s) return s;
            rollback = s.integrations.workspaces.find((w) => w.id === workspaceId)?.internalNotes;
            return {
              ...s,
              integrations: {
                ...s.integrations,
                workspaces: s.integrations.workspaces.map((w) =>
                  w.id === workspaceId ? { ...w, internalNotes } : w
                ),
              },
            };
          });
          const result = await setWorkspaceNotesAction(internalNotes);
          if (!result.ok) {
            const previous = rollback;
            if (previous !== undefined) {
              setState((s) =>
                s
                  ? {
                      ...s,
                      integrations: {
                        ...s.integrations,
                        workspaces: s.integrations.workspaces.map((w) =>
                          w.id === workspaceId ? { ...w, internalNotes: previous } : w
                        ),
                      },
                    }
                  : s
              );
            }
            toast("Couldn't save those notes", { description: result.error });
            return false;
          }
          return true;
        },

        setFeatureFlag(workspaceId, flag, enabled) {
          let rollback: boolean | undefined;
          setState((s) => {
            if (!s) return s;
            rollback = s.integrations.workspaces.find((w) => w.id === workspaceId)?.featureFlags[flag];
            return {
              ...s,
              integrations: {
                ...s.integrations,
                workspaces: s.integrations.workspaces.map((w) =>
                  w.id === workspaceId ? { ...w, featureFlags: { ...w.featureFlags, [flag]: enabled } } : w
                ),
              },
            };
          });
          void setFeatureFlagAction(flag, enabled).then((result) => {
            if (!result.ok) {
              const previous = rollback;
              if (previous !== undefined) {
                setState((s) =>
                  s
                    ? {
                        ...s,
                        integrations: {
                          ...s.integrations,
                          workspaces: s.integrations.workspaces.map((w) =>
                            w.id === workspaceId ? { ...w, featureFlags: { ...w.featureFlags, [flag]: previous } } : w
                          ),
                        },
                      }
                    : s
                );
              }
              toast("Couldn't change that flag", { description: result.error });
            }
          });
        },
      },

      notifications: {
        notifications: state?.notifications ?? [],
        markRead(id) {
          setState((s) =>
            s ? { ...s, notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) } : s
          );
          void markNotificationReadAction(id);
        },
        markAllRead() {
          setState((s) =>
            s ? { ...s, notifications: s.notifications.map((n) => ({ ...n, read: true })) } : s
          );
          void markAllNotificationsReadAction();
        },
      },

      settings: {
        ...settings,

        async setAccount(patch) {
          let rollback: SettingsState["account"] | null = null;
          setState((s) => {
            if (!s) return s;
            rollback = s.settings.account;
            return { ...s, settings: { ...s.settings, account: { ...s.settings.account, ...patch } } };
          });
          const result = await updateAccountAction({ name: patch.name, jobTitle: patch.jobTitle });
          if (result.ok) return true;
          const previous = rollback;
          if (previous) setState((s) => (s ? { ...s, settings: { ...s.settings, account: previous } } : s));
          toast("Couldn't save your details", { description: result.error });
          return false;
        },

        setNotification(key, channel, value) {
          let rollback: SettingsState["notifications"] | null = null;
          setState((s) => {
            if (!s) return s;
            rollback = s.settings.notifications;
            return {
              ...s,
              settings: {
                ...s.settings,
                notifications: {
                  ...s.settings.notifications,
                  [key]: { ...s.settings.notifications[key], [channel]: value },
                },
              },
            };
          });
          void updateNotificationPreferenceAction(key, channel, value).then((result) => {
            if (result.ok) return;
            const previous = rollback;
            if (previous)
              setState((s) => (s ? { ...s, settings: { ...s.settings, notifications: previous } } : s));
            toast("Couldn't save that preference", { description: result.error });
          });
        },

        setDashboard(patch) {
          let rollback: SettingsState["dashboard"] | null = null;
          setState((s) => {
            if (!s) return s;
            rollback = s.settings.dashboard;
            return { ...s, settings: { ...s.settings, dashboard: { ...s.settings.dashboard, ...patch } } };
          });
          void updateDashboardSettingsAction(patch).then((result) => {
            if (result.ok) return;
            const previous = rollback;
            if (previous) setState((s) => (s ? { ...s, settings: { ...s.settings, dashboard: previous } } : s));
            toast("Couldn't save that preference", { description: result.error });
          });
        },
      },
    };
  }, [state, ready, commitConfiguration, commitKnowledge, router]);

  return <WorkspaceStoresContext.Provider value={stores}>{children}</WorkspaceStoresContext.Provider>;
}

function applyIntegrationResult(
  setState: React.Dispatch<React.SetStateAction<MutableState | null>>,
  id: string,
  result: { ok: true; record: IntegrationRecord } | { ok: false; error: string }
) {
  setState((s) => {
    if (!s) return s;
    return {
      ...s,
      integrations: {
        ...s.integrations,
        pending: s.integrations.pending.filter((p) => p !== id),
        integrations: s.integrations.integrations.map((r) =>
          r.id === id && result.ok ? result.record : r
        ),
      },
    };
  });
}

// ── Hooks ───────────────────────────────────────────────────────────────────
//
// Both call shapes the previous stores supported are preserved: the whole slice,
// or a selector over it.

function useStores(): WorkspaceStores {
  const stores = React.useContext(WorkspaceStoresContext);
  if (!stores) throw new Error("Workspace stores used outside WorkspaceStoresProvider");
  return stores;
}

export function useConfiguration(): ConfigurationState;
export function useConfiguration<T>(selector: (state: ConfigurationState) => T): T;
export function useConfiguration<T>(selector?: (state: ConfigurationState) => T) {
  const { configuration } = useStores();
  return selector ? selector(configuration) : configuration;
}

export function useIntegrations(): IntegrationsState;
export function useIntegrations<T>(selector: (state: IntegrationsState) => T): T;
export function useIntegrations<T>(selector?: (state: IntegrationsState) => T) {
  const { integrations } = useStores();
  return selector ? selector(integrations) : integrations;
}

export function useNotifications(): NotificationsState;
export function useNotifications<T>(selector: (state: NotificationsState) => T): T;
export function useNotifications<T>(selector?: (state: NotificationsState) => T) {
  const { notifications } = useStores();
  return selector ? selector(notifications) : notifications;
}

export function useSettings(): SettingsState;
export function useSettings<T>(selector: (state: SettingsState) => T): T;
export function useSettings<T>(selector?: (state: SettingsState) => T) {
  const { settings } = useStores();
  return selector ? selector(settings) : settings;
}

/** True once the server's data has arrived. Views show skeletons until then. */
export function useWorkspaceReady(): boolean {
  return useStores().ready;
}

/** Records for one workspace — the store only ever holds the authorized one. */
export function useWorkspaceIntegrations(workspaceId?: string): IntegrationRecord[] {
  const { integrations } = useStores();
  return workspaceId
    ? integrations.integrations.filter((r) => r.workspaceId === workspaceId)
    : integrations.integrations;
}

// ── Placeholders for the pre-data render ────────────────────────────────────
//
// Used only before the server's payload arrives (the sign-in page, or a failed
// load). Empty rather than plausible: invented business data that looks real is
// worse than none.

const EMPTY_CONFIGURATION: AppConfiguration = {
  business: {
    name: "",
    phone: "",
    email: "",
    address: "",
    website: "",
    timezone: "UTC",
    category: "",
    description: "",
  },
  hours: [],
  specialHours: [],
  services: [],
  knowledge: [],
  ai: {
    enabled: false,
    channels: { voice: false, sms: false, email: false },
    greeting: "",
    personality: "friendly",
    voice: { name: "", speedPct: 100, tone: "" },
    booking: {
      defaultDurationMin: 30,
      minNoticeMin: 0,
      maxAdvanceDays: 60,
      maxConcurrent: 1,
      sendConfirmation: false,
      allowReschedule: false,
      allowCancellation: false,
    },
    escalation: {
      whenUnsure: "take_message",
      urgentRequests: "escalate",
      unsupportedRequests: "ask_to_call",
    },
    afterHours: "answer_no_booking",
  },
};

const EMPTY_INTEGRATIONS: MutableState["integrations"] = {
  workspaces: [],
  capabilities: [],
  checkedAt: null,
  integrations: [],
  workflows: [],
  events: [],
  pending: [],
};

const EMPTY_SETTINGS: MutableState["settings"] = {
  account: { name: "", email: "", jobTitle: "" },
  notifications: {
    appointment_booked: { inApp: true, email: true, sms: false },
    appointment_cancelled: { inApp: true, email: true, sms: false },
    appointment_rescheduled: { inApp: true, email: false, sms: false },
    integration_problem: { inApp: true, email: true, sms: false },
    ai_could_not_answer: { inApp: true, email: false, sms: false },
    high_missed_calls: { inApp: true, email: true, sms: false },
  },
  dashboard: { landingPage: "/", defaultRange: "7d", timestampStyle: "relative" },
};
