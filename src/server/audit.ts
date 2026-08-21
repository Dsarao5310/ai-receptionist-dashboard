import "server-only";

import type { AuditAction, AuditEvent } from "@/types/identity";
import type { IdentityRepository } from "@/server/db/repository";
import { identityRepository } from "@/server/db/identity";
import { serverNow } from "./clock";

/**
 * The audit trail.
 *
 * Records who did what, to what, in which tenant, when. It is a product audit
 * trail, not a logging platform: bounded, structured, and readable by an
 * operator investigating a support question.
 *
 * ── What must never go in ───────────────────────────────────────────────────
 * No credentials, tokens, cookies, authorization headers, or raw provider
 * payloads. `metadata` takes small, safe descriptors only — ids, names,
 * before/after values of non-sensitive fields. `sanitizeMetadata` drops
 * anything whose key looks credential-shaped, so a careless call site fails
 * safe rather than writing a secret into a table people read casually.
 */

const SENSITIVE_KEY = /token|secret|password|credential|api[_-]?key|authorization|cookie/i;

export function sanitizeMetadata(
  metadata: Record<string, unknown>
): Record<string, string | number | boolean | null> {
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEY.test(key)) continue;
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      safe[key] = value;
    }
  }
  return safe;
}

export async function recordAuditEvent(
  input: {
    actorUserId: string | null;
    workspaceId: string | null;
    action: AuditAction;
    targetType?: string | null;
    targetId?: string | null;
    metadata?: Record<string, unknown>;
  },
  repo: IdentityRepository = identityRepository
): Promise<AuditEvent> {
  return repo.recordAudit({
    actorUserId: input.actorUserId,
    workspaceId: input.workspaceId,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    timestamp: serverNow().toISOString(),
    metadata: sanitizeMetadata(input.metadata ?? {}),
  });
}
