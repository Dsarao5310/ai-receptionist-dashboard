# Latest Handoff

Updated: 2026-09-01
Status: SECRET-SCAN CONFIRMED CLEAN, MISSING SECURITY HEADERS FIXED

## What happened

User asked to keep doing more no-cost maintenance work.

**1. Full-git-history secret scan.** Directly relevant given this
project's earlier real key-exposure incident (a Pinecone key pasted into
local CLI history, never into this repo). GitHub's `run_secret_scanning`
needs Advanced Security, not enabled here, so did it manually instead:

- Confirmed no `.env*` file other than the values-free `.env.example` was
  ever committed, in any commit ever.
- `git log --all -G` (pickaxe) across the whole history for common
  leaked-secret shapes: Pinecone `pcsk_`, Anthropic `sk-ant-`, Google
  `AIza`/`ya29.`, AWS `AKIA`, Slack `xox[bp]-`, Twilio account SIDs, and
  any `postgres://user:pass@host` connection string.
- Every hit read in full context: a runbook checklist line telling an
  operator to grep for a token prefix and expect nothing, a unit test
  verifying `Secret`'s redaction with an obviously-fake token, and
  connection-string test fixtures using the literal words
  "secret"/"password" against fake hosts. Nothing real.
- Read `credential-store.ts`/`secret-store.ts`/`env.ts`/`.env.example` in
  full — every value is `process.env`-sourced or empty by design.

Clean, confirmed — not just an absence of hits.

**2. Missing global security headers — a real gap, now fixed.**
`next.config.ts` had zero global HTTP security headers; the only header
anywhere in the app was a route-specific `nosniff` on `/api/health`.
Confirmed by grep across `src/`, `next.config.ts`, `vercel.json`.

Read Next's own bundled docs first
(`node_modules/next/dist/docs/.../headers.md`), then added to
`next.config.ts` on every route:

- `X-Frame-Options: DENY`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`
- `Strict-Transport-Security: max-age=63072000; includeSubDomains`

Two deliberate exclusions, made explicit rather than silently assumed:

- **No CSP.** Needs a careful source-by-source audit this no-DB sandbox
  can't fully verify against a real authenticated page; getting it wrong
  breaks the app rather than hardening it. `X-Frame-Options: DENY` covers
  the one thing CSP would otherwise add here (clickjacking) — flagged as
  a deliberate follow-up, not attempted today.
- **No HSTS `preload`.** Effectively permanent once submitted, covers
  every subdomain forever — a real decision, not a default. Used
  `includeSubDomains` alone, fully reversible.

Confirmed camera/mic/geolocation are safe to restrict — grepped for
`getUserMedia`/`navigator.geolocation`/`navigator.mediaDevices`/
`RTCPeerConnection` across `src/`: zero matches, this app never uses any
of them.

## Verification

- `npx next typegen && npm run typecheck && npm run lint`: clean.
- `npm run build`: exit 0, 0 warnings (full log checked, not just tail).
- Booted the dev server, confirmed all five headers on real `curl -sD -`
  responses for both `/sign-in` and `/api/health` (the route's own
  `nosniff` doesn't conflict — same value).
- `npx vitest run`: 41/41 files, 396/396 tests passed, 5 files/199 tests
  skipped as expected (DB-backed, no live DB here). Nothing broke.

## Standing batch — still untouched

Nothing in this pass touched Supabase billing/plan, n8n, Twilio, or Vapi
live setup.

## Still open

Whether to drop production's stale `app_test` schema (raised two passes
ago) — still unanswered. Ask again or wait for the user.

## Next safe action

Nothing else pending from this pass — committed and pushed to the task
branch in the same turn as this write-up. Standing priorities per the
user's last direction remain, in order: (1) live Knowledge/Pinecone
wiring into the AI receptionist flow — blocked on (2); (2) Twilio/Vapi
live certification — paused, costs money, batched with Supabase Pro
upgrade, wait for explicit user go-ahead; (3) the backup-restore drill —
externally gated on plan tier.
