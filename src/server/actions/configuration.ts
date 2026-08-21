"use server";

import { revalidatePath } from "next/cache";
import type {
  AIConfiguration,
  BusinessIdentity,
  BusinessService,
  DayHours,
  KnowledgeEntry,
  SpecialHours,
} from "@/types";
import { AuthenticationError, AuthorizationError, requirePermission } from "@/server/auth/guards";
import { recordAuditEvent } from "@/server/audit";
import { scopeFor } from "@/server/workspace-data";
import { isValidTimeZone } from "@/lib/timezone";

/**
 * Business profile and receptionist configuration, written on the server.
 *
 * ── Two permissions, not one ────────────────────────────────────────────────
 * Editing the business itself — its name, address, hours, services, knowledge —
 * requires `business.edit`, which only an owner holds. Changing how the
 * receptionist behaves requires `ai.configure`, which a manager also holds. A
 * manager can retune the greeting without being able to rewrite the opening
 * hours, which is the distinction the product's role table already describes.
 *
 * ── Why each edit is its own action ─────────────────────────────────────────
 * There is no "save the whole configuration document" action. One would let a
 * stale tab overwrite everything another tab had changed, and it would make the
 * audit trail useless — "configuration changed" tells an operator nothing.
 * Narrow actions mean narrow writes and a legible history.
 */

export type ConfigResult = { ok: true } | { ok: false; error: string };

function toFailure(error: unknown): { ok: false; error: string } {
  if (error instanceof AuthorizationError || error instanceof AuthenticationError) {
    return { ok: false, error: error.publicMessage };
  }
  throw error;
}

function revalidateWorkspaceViews(): void {
  revalidatePath("/", "layout");
}

// ── Business identity ───────────────────────────────────────────────────────

export async function updateBusinessAction(patch: Partial<BusinessIdentity>): Promise<ConfigResult> {
  try {
    const context = await requirePermission("business.edit");
    const scope = scopeFor(context);

    // The timezone decides what every wall clock in this tenant means. An
    // unrecognised zone would make hours, day boundaries and the derived
    // appointment instants meaningless, so it is refused rather than stored.
    if (patch.timezone !== undefined && !isValidTimeZone(patch.timezone)) {
      return { ok: false, error: `"${patch.timezone}" is not a recognised timezone.` };
    }

    const before = await scope.configuration.load();
    await scope.configuration.updateBusiness(patch);

    // Changing the timezone changes which moment "10:00" names. The derived
    // instants on every existing appointment have to follow, or ordering and
    // analytics silently drift away from the wall clocks people booked.
    if (patch.timezone && before && patch.timezone !== before.business.timezone) {
      const moved = await scope.appointments.recomputeInstants(patch.timezone);
      await recordAuditEvent({
        actorUserId: context.user.id,
        workspaceId: context.workspaceId,
        action: "business_profile.changed",
        targetType: "configuration",
        targetId: "timezone",
        metadata: { from: before.business.timezone, to: patch.timezone, appointmentsRecomputed: moved },
      });
    }

    await recordAuditEvent({
      actorUserId: context.user.id,
      workspaceId: context.workspaceId,
      action: "business_profile.changed",
      targetType: "configuration",
      targetId: "business",
      metadata: { fields: Object.keys(patch).join(", ") },
    });

    revalidateWorkspaceViews();
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Hours ───────────────────────────────────────────────────────────────────

export async function updateHoursAction(hours: DayHours[]): Promise<ConfigResult> {
  try {
    const context = await requirePermission("business.edit");

    for (const day of hours) {
      for (const interval of day.intervals) {
        if (interval.close <= interval.open) {
          return { ok: false, error: `${day.day}: closing time must be after opening time.` };
        }
      }
    }

    await scopeFor(context).configuration.replaceHours(hours);
    await recordAuditEvent({
      actorUserId: context.user.id,
      workspaceId: context.workspaceId,
      action: "business_profile.changed",
      targetType: "configuration",
      targetId: "hours",
      metadata: { openDays: hours.filter((d) => d.isOpen).length },
    });

    revalidateWorkspaceViews();
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Special hours ───────────────────────────────────────────────────────────

export async function addSpecialHoursAction(entry: Omit<SpecialHours, "id">): Promise<ConfigResult> {
  try {
    const context = await requirePermission("business.edit");
    await scopeFor(context).configuration.addSpecialHours(entry);
    await recordAuditEvent({
      actorUserId: context.user.id,
      workspaceId: context.workspaceId,
      action: "business_profile.changed",
      targetType: "special_hours",
      targetId: entry.date,
      metadata: { label: entry.label, closed: entry.isClosed },
    });
    revalidateWorkspaceViews();
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

export async function updateSpecialHoursAction(
  id: string,
  patch: Partial<Omit<SpecialHours, "id">>
): Promise<ConfigResult> {
  try {
    const context = await requirePermission("business.edit");
    await scopeFor(context).configuration.updateSpecialHours(id, patch);
    revalidateWorkspaceViews();
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

export async function removeSpecialHoursAction(id: string): Promise<ConfigResult> {
  try {
    const context = await requirePermission("business.edit");
    await scopeFor(context).configuration.removeSpecialHours(id);
    revalidateWorkspaceViews();
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Services ────────────────────────────────────────────────────────────────

export async function addServiceAction(
  service: Omit<BusinessService, "id">
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const context = await requirePermission("business.edit");
    const id = await scopeFor(context).configuration.addService(service);
    await recordAuditEvent({
      actorUserId: context.user.id,
      workspaceId: context.workspaceId,
      action: "business_profile.changed",
      targetType: "service",
      targetId: id,
      metadata: { name: service.name, created: true },
    });
    revalidateWorkspaceViews();
    return { ok: true, id };
  } catch (error) {
    return toFailure(error);
  }
}

export async function updateServiceAction(
  id: string,
  patch: Partial<Omit<BusinessService, "id">>
): Promise<ConfigResult> {
  try {
    const context = await requirePermission("business.edit");
    await scopeFor(context).configuration.updateService(id, patch);
    await recordAuditEvent({
      actorUserId: context.user.id,
      workspaceId: context.workspaceId,
      action: "business_profile.changed",
      targetType: "service",
      targetId: id,
      metadata: { fields: Object.keys(patch).join(", ") },
    });
    revalidateWorkspaceViews();
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

/**
 * Removing a service removes the catalogue entry only.
 *
 * Past appointments keep the snapshot of what was actually booked and lose only
 * their link to an entry that no longer exists — the drawer shows that as
 * drift. No history is rewritten, which is why this is allowed to be a real
 * delete rather than a hidden flag.
 */
export async function removeServiceAction(id: string): Promise<ConfigResult> {
  try {
    const context = await requirePermission("business.edit");
    await scopeFor(context).configuration.removeService(id);
    await recordAuditEvent({
      actorUserId: context.user.id,
      workspaceId: context.workspaceId,
      action: "business_profile.changed",
      targetType: "service",
      targetId: id,
      metadata: { removed: true },
    });
    revalidateWorkspaceViews();
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

export async function moveServiceAction(id: string, direction: -1 | 1): Promise<ConfigResult> {
  try {
    const context = await requirePermission("business.edit");
    await scopeFor(context).configuration.moveService(id, direction);
    revalidateWorkspaceViews();
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Knowledge ───────────────────────────────────────────────────────────────

export async function addKnowledgeAction(
  entry: Omit<KnowledgeEntry, "id">
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const context = await requirePermission("business.edit");
    const id = await scopeFor(context).configuration.addKnowledge(entry);
    revalidateWorkspaceViews();
    return { ok: true, id };
  } catch (error) {
    return toFailure(error);
  }
}

export async function updateKnowledgeAction(
  id: string,
  patch: Partial<Omit<KnowledgeEntry, "id">>
): Promise<ConfigResult> {
  try {
    const context = await requirePermission("business.edit");
    await scopeFor(context).configuration.updateKnowledge(id, patch);
    revalidateWorkspaceViews();
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

export async function removeKnowledgeAction(id: string): Promise<ConfigResult> {
  try {
    const context = await requirePermission("business.edit");
    await scopeFor(context).configuration.removeKnowledge(id);
    revalidateWorkspaceViews();
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}

// ── Receptionist behaviour ──────────────────────────────────────────────────

export async function updateAIAction(patch: Partial<AIConfiguration>): Promise<ConfigResult> {
  try {
    // A manager may retune the receptionist without being able to edit the
    // business it represents.
    const context = await requirePermission("ai.configure");
    await scopeFor(context).configuration.updateAI(patch);
    await recordAuditEvent({
      actorUserId: context.user.id,
      workspaceId: context.workspaceId,
      action: "ai_configuration.changed",
      targetType: "configuration",
      targetId: "ai",
      metadata: { fields: Object.keys(patch).join(", ") },
    });
    revalidateWorkspaceViews();
    return { ok: true };
  } catch (error) {
    return toFailure(error);
  }
}
