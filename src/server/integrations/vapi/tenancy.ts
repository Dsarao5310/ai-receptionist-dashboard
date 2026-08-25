import "server-only";

import { getDb, type Sql } from "@/server/db/client";

export interface VapiTenantResources {
  assistantId: string | null;
  phoneNumberId: string | null;
  phoneNumber: string | null;
}

export type VapiTenantResolution =
  | { ok: true; workspaceId: string }
  | { ok: false; reason: "unknown_resource" | "mapping_conflict" };

/**
 * Establish tenancy from provider resources the platform provisioned.
 *
 * This is intentionally the only unscoped Vapi query. It returns a workspace
 * id and no tenant data. If assistant and phone mappings disagree, the event is
 * refused rather than letting either resource win by ordering accident.
 */
export async function resolveWorkspaceFromVapiResources(
  resources: VapiTenantResources,
  sql: Sql = getDb()
): Promise<VapiTenantResolution> {
  const rows = await sql`
    select distinct workspace_id from (
      select workspace_id
      from vapi_assistants
      where ${resources.assistantId}::text is not null
        and assistant_id = ${resources.assistantId}
        and active = true

      union all

      select workspace_id
      from provider_phone_numbers
      where provider = 'vapi'
        and voice_enabled = true
        and (
          (${resources.phoneNumberId}::text is not null and provider_sid = ${resources.phoneNumberId})
          or (${resources.phoneNumber}::text is not null and phone_number = ${resources.phoneNumber})
        )
    ) trusted_resources`;

  if (rows.length === 0) return { ok: false, reason: "unknown_resource" };
  if (rows.length !== 1) return { ok: false, reason: "mapping_conflict" };
  return { ok: true, workspaceId: String(rows[0].workspace_id) };
}
