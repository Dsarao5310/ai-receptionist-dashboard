# Latest Handoff

Updated: 2026-09-01
Status: CI CONFIRMED HEALTHY, RLS BOUNDARY INDEPENDENTLY VERIFIED — NO GAP FOUND

## What happened

User asked to keep doing more no-cost maintenance work. Three checks,
read-only throughout except one externally-approved HTTP request.

**1. CI health**, never verified this session. `.github/workflows/
ci.yml` ("Repository validation") runs `next typegen` → `typecheck` →
`lint` → `npm test` → `deploy:build` + `audit:client-secrets` on every
push to `master`/`staging` and every PR. Pulled the last 30 runs: all
green, the one `cancelled` run was just superseded by a newer push to
the same ref (concurrency cancellation), not a failure. By design it
doesn't trigger on arbitrary task-branch pushes, so this branch's later
commits today are only locally verified so far — expected given the
trigger config.

**2. Supabase extensions**, both projects: clean. Only 5 actually
installed on either — `pgcrypto`, `pg_stat_statements`,
`supabase_vault`, `uuid-ossp`, `plpgsql`, all standard defaults. Notably
absent: `pg_net`/`http` (would let the database make outbound calls
itself).

**3. RLS is disabled on all 45 `app`-schema tables on production —
checked whether this is a gap, found it's the documented, correct
architecture.** Queried `pg_class`/`pg_policy` directly. Re-read
`database.md`'s own line first: "RLS is not a decorative security
claim... Application authorization and private-schema access remain
authoritative" is *describing* the actual boundary, not claiming RLS
does the work — correct, since this app never uses Supabase Auth, so
`auth.uid()` is always null and an RLS policy built on it would be
actively misleading.

Didn't stop at re-reading the doc — tested the claim the whole model
depends on: that `app` is genuinely unreachable via Supabase's
auto-generated PostgREST API. That needed one live external HTTP call
against production's public anon key; the auto-mode classifier correctly
flagged it for approval, asked the user, they approved it specifically
for this one check. Result: `GET .../rest/v1/users` with
`Accept-Profile: app` → `406 {"code":"PGRST106","message":"Invalid
schema: app"}`, and PostgREST's own error names the exposed set:
`Only the following schemas are exposed: public, graphql_public`. The
`public` schema probe for `workspaces` also 404s — confirms `public`
holds none of the app's tables either. The documented security model is
now independently confirmed to actually hold, not just asserted.

## Verification

- CI run history pulled via `actions_list`/`list_workflow_runs`.
- `list_extensions` (Supabase MCP) on both projects.
- Direct read-only SQL (`pg_class`/`pg_policy`) on production.
- One user-approved read-only `curl` against the production PostgREST
  endpoint with the public anon key (no data mutated, no auth bypassed —
  the calls confirm the boundary holds, they don't cross it).

## Standing batch — still untouched

Nothing in this pass touched Supabase billing/plan, n8n, Twilio, or Vapi
live setup.

## Still open

Whether to drop production's stale `app_test` schema (raised a few
passes ago) — still unanswered. Ask again or wait for the user.

## Next safe action

Nothing else pending from this pass. Standing priorities per the user's
last direction remain, in order: (1) live Knowledge/Pinecone wiring into
the AI receptionist flow — blocked on (2); (2) Twilio/Vapi live
certification — paused, costs money, batched with Supabase Pro upgrade,
wait for explicit user go-ahead; (3) the backup-restore drill —
externally gated on plan tier.
