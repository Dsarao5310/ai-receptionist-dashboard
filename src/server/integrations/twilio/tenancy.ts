import "server-only";

import { getDb, type Sql } from "@/server/db/client";

/**
 * Which workspace a phone number belongs to.
 *
 * ── The one query here that is deliberately not workspace-scoped ────────────
 * For the same reason `authorizeWorkspace` is not, and the same reason n8n's
 * `resolveWorkspaceFromWorkflowRef` is not: this is how a tenant is
 * *established*, so it cannot presuppose one. It is narrow on purpose — it
 * reads a mapping row and returns an id, and it reads no tenant data
 * whatsoever. Everything after it goes through `workspaceScope`.
 *
 * ── Why the number and not the payload ──────────────────────────────────────
 * A valid Twilio signature proves the request came from Twilio. It says nothing
 * about which business it is for: one Twilio account can hold numbers for every
 * tenant on the platform, so a signature that decided tenancy would let any
 * number write into any workspace. The mapping is a row *we* issued, and the
 * unique constraint on `phone_number` is what makes a match unambiguous.
 *
 * A number that matches nothing resolves to null and the event is refused. That
 * is the correct outcome for traffic to a number we do not serve.
 */
export async function resolveWorkspaceFromNumber(
  phoneNumber: string,
  provider: "twilio" | "vapi" = "twilio",
  sql: Sql = getDb()
): Promise<{ workspaceId: string; numberId: string; smsEnabled: boolean } | null> {
  const [row] = await sql`
    select workspace_id, id, sms_enabled
    from provider_phone_numbers
    where phone_number = ${phoneNumber} and provider = ${provider}`;

  return row
    ? {
        workspaceId: String(row.workspace_id),
        numberId: String(row.id),
        smsEnabled: row.sms_enabled === true,
      }
    : null;
}
