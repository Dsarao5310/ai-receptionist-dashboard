# Latest Handoff

Updated: 2026-09-01
Status: DEPENDENCY HYGIENE + HTTP-BOUNDARY REVIEW PASS COMPLETE — NO BUG FOUND

## What happened

User asked for any other legitimate no-cost work on the project, explicitly
excluding the paused Supabase Pro + n8n + Twilio + Vapi batch (that
remains untouched — see below). Three pieces of work:

**1. Dependency hygiene.** `npm audit` (with and without `--omit=dev`): 0
vulnerabilities, both times. `npm outdated`: nothing security-relevant
behind current; a handful of majors are available (`next` 16.3.4, `ai`
7.x, `typescript` 7.x, `vitest` 4.x, `eslint` 10.x) but not touched — a
major bump is real upgrade work with regression risk, out of scope for
opportunistic cleanup. One thing worth flagging so it isn't misread
later: `npm outdated` shows `next-auth` "Latest: 4.24.15", which looks
like a downgrade target but isn't — that's npm's stable dist-tag for the
v4 line; this repo is intentionally on the v5 beta (`5.0.0-beta.32`) per
`CLAUDE.md`'s locked architecture decision. Not a real outdated-package
flag.

**2. First real browser check this session.** Every earlier verification
this session was static (typecheck/lint/tests/build) — the app itself was
never actually driven. Booted `npm run dev` (Turbopack): ready in ~2.4s,
`GET /sign-in` returns 200 with correct title/content, no console or
server errors, dev-only "Development accounts" sign-in buttons render
correctly labeled. Confirmed this sandbox has no `DATABASE_URL`/
`AUTH_SECRET`/etc. anywhere (checked both `.env.local`, which doesn't
exist, and the shell environment) — so this is the actual ceiling of what
browser verification can reach here; anything past the sign-in page needs
a real database this environment doesn't have. Tried one raw POST against
a dev-account sign-in button; inconclusive by design (a plain curl POST
doesn't reproduce Next.js's Server Action wire protocol) and not worth
engineering further just to rediscover the same known no-DB limit that's
already governed the DB-backed test suite all session.

**3. HTTP-boundary review — the one layer the five earlier passes hadn't
targeted directly.** Those passes covered the shared provider/integration
*logic* (`src/server/integrations/`); this pass read the thin Next.js
route handlers that actually sit on the internet in front of it, against
`.claude/rules/security.md`:

- `POST /api/internal/twilio/sms`, `POST /api/internal/twilio/status`
- `POST /api/internal/n8n/events`, `POST /api/internal/vapi/events`
- `GET /api/admin/calendar/authorize`, `GET /api/admin/calendar/callback`
- `GET /api/internal/cron/privacy-purge`
- the NextAuth catch-all route, and `src/proxy.ts`

Every webhook route rejects a missing signature/authorization header
before reading the body, reads the raw body exactly once (required —
re-serializing would break signatures computed over the original bytes),
returns uniform no-detail failures on auth rejection, and correctly
distinguishes permanent (`422`/`403`, no retry) from transient (`503`,
retry expected) outcomes. Tenancy is always resolved from a trusted
server-side mapping, never a client-supplied id. The calendar OAuth
callback re-checks `integrations.manage` against the *state row's*
workspace (not the session's current one) and never echoes a token
anywhere. The cron route's bearer check (`verifyCronAuthorization`) is
already SHA-256 + `timingSafeEqual` — properly constant-time.
`src/proxy.ts` is correctly optimistic-only (cookie presence gates a
redirect, never authorization) with no admin path in its public
allowlist. No bug, no gap, nothing fixed — a clean confirmation pass.

## Verification

- `npm audit`, `npm audit --omit=dev`: 0 vulnerabilities both.
- `npm outdated`: captured and reviewed, nothing actioned.
- Dev server boot + `/sign-in` response inspected directly over real
  HTTP (200, correct HTML/title, no error markers in response or server
  log).
- HTTP-boundary review: read-only, no code changed, nothing to
  typecheck/lint/test.

## Standing batch — still untouched

Nothing in this pass touched Supabase, n8n, Twilio, or Vapi. That batch
remains paused exactly as before; the user will say when ready.

## Next safe action

Nothing pending from this pass — it is closed. Standing priorities per
the user's last direction remain, in order: (1) live Knowledge/Pinecone
wiring into the AI receptionist flow — blocked on (2); (2) Twilio/Vapi
live certification — paused, costs money, batched with Supabase Pro
upgrade, wait for explicit user go-ahead; (3) the backup-restore drill —
externally gated on plan tier.
