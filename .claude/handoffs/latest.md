# Latest Handoff

Updated: 2026-09-01
Status: MAINTENANCE PASS COMPLETE — ONE REAL FINDING, NO ACTION TAKEN (needs user go-ahead)

## What happened

User asked to keep doing more no-cost maintenance work. Three pieces:

**1. TODO/FIXME/XXX sweep** across `src/` — zero matches, nothing
forgotten.

**2. Clean production build** — `npx next typegen && npm run build`:
exit 0, compiled in 15.9s, all 26 routes correctly dynamic, zero warnings
anywhere in the full log (checked the whole thing, not just the tail).

**3. Supabase advisor refresh — turned into a real, traced finding.**
Security advisor: staging 0 findings; production 2 WARN
(`function_search_path_mutable`, both on `app_test` functions).
Performance advisor: both projects almost entirely INFO-level
`unused_index` noise on fresh data (expected), except production also had
11 `unindexed_foreign_keys` INFO items, all on three `app_test` tables.

Didn't take the advisor's framing at face value — traced both findings to
ground truth with direct read-only SQL:

- Both come from one migration, `20260825151957_provider_privacy_
  advisor_hardening.sql`, which is applied to production's real `app`
  schema (Aug 25) but was **never applied to production's `app_test`
  schema**.
- The full `app` vs `app_test` ledger diff on production shows this isn't
  isolated: production's hosted `app_test` has only 3 of 19 migrations
  recorded, all applied at the same instant (2026-08-25 05:28:29 UTC),
  and even those 3 have checksum mismatches against `app`'s current
  ledger. The 16 foundational migrations were never applied there at
  all.
- Staging's `app_test`, for comparison, is **completely empty** — 0
  migrations. That's the expected shape: `app_test` is the disposable
  test-shaped schema the DB-backed test harness tears down and fully
  rebuilds (`db:reset` + `db:migrate`) at the start of every real hosted
  test run. Staging shows what that looks like at rest between runs.
  Production's partial, checksum-mismatched remnant is leftover debris
  from one interrupted or early run on Aug 25 that was never cleaned up.

**Not a live risk.** `app_test` holds no real tenant data and nothing in
the running application reads or writes it. The correct fix, if it's ever
used again, is the same `db:reset`+`db:migrate` cycle that already
self-heals this — not a manual migration bridge, and not something this
sandbox can attempt anyway (no `MIGRATION_DATABASE_URL` here).

**One optional, real cleanup item for the user**: production's stale
`app_test` is the literal source of the only 2 non-clean security-advisor
findings across both projects. `DROP SCHEMA app_test CASCADE` on the
production project would clear that noise for free — it's explicitly
disposable, test-only data. Not done unprompted: it's a mutating action
against a live hosted database project, and that warrants asking first
regardless of how low-stakes the target is. Nothing was created, dropped,
or altered — every query this pass ran was read-only introspection
(`select` against `pg_constraint`/`pg_indexes`/`schema_migrations`).

## Verification

- `grep -rn "TODO|FIXME|XXX|HACK:" src/`: 0 matches.
- `npx next typegen && npm run build`: exit 0, full log checked for
  warnings (`grep -i "warn|deprecat"`), none found.
- Supabase advisor calls + direct SQL introspection: all read-only,
  confirmed via the tool responses (no write/DDL statements issued).

## Standing batch — still untouched

Nothing in this pass touched Supabase billing/plan, n8n, Twilio, or Vapi
live setup. That batch remains paused exactly as before.

## Next safe action

Ask the user whether to drop production's stale `app_test` schema (the
one optional cleanup above) — otherwise this pass is closed. Standing
priorities per the user's last direction remain, in order: (1) live
Knowledge/Pinecone wiring into the AI receptionist flow — blocked on (2);
(2) Twilio/Vapi live certification — paused, costs money, batched with
Supabase Pro upgrade, wait for explicit user go-ahead; (3) the
backup-restore drill — externally gated on plan tier.
