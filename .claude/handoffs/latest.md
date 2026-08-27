# Latest Handoff

Updated: 2026-08-27
Status: READ-ONLY RECOVERY VERIFIER READY; TRUE BACKUP RESTORE UNPERFORMED

## Repository checkpoint

- Base before the recovery change: local `master` and `origin/master` at
  `cf8ae0b`. Health route `d1b2d84` and proxy
  fix `bf8774b` are deployed ancestors.
- `origin/staging` remains `64fa59a`.
- Preserve and exclude the pre-existing untracked `.claude/worktrees/`.

## Completed

- Added dynamic Node.js `GET`/`HEAD /api/health` deployment liveness.
- GET returns only `{ "status": "ok" }`; HEAD has no body.
- Browser and Vercel CDN caches are disabled for the response.
- No database/provider dependency is contacted and no environment, tenant,
  credential, version, hostname, or customer data is exposed.
- Structured logs are bounded and omit query strings and authorization headers.
- Added monitoring readiness and operations-runbook guidance.
- Added `/api/health` to the proxy's public allowlist without opening any
  business route.
- Added `npm run db:recovery:verify`, a content-free, read-only verifier for a
  backup already restored into a separate disposable Supabase project.
- It refuses known staging/Production refs, mismatched projects/roles, and an
  incorrect project-bound confirmation before connecting.

## Verification

- Focused health tests: 2/2 passed.
- Full gate: typecheck, lint, 45/45 files and 577/577 tests passed.
- Optimized Next.js production build passed with `/api/health` dynamic.
- Client-secret audit passed across 56 artifacts without printing values.
- Focused route/proxy tests passed 6/6 after the proxy fix.
- Rebuilt production server passed unauthenticated local GET/HEAD through the
  real proxy: 200, minimal/body-free responses, and expected no-store headers.
- Recovery guards passed 5/5; the staging-ref command failed closed before any
  database connection. Client-secret audit passed across 56 artifacts.

## Remaining boundary

- Production `dpl_DzM2nQB42EGDVccnDdupih8zQf6j` is READY. GET/HEAD passed live
  HTTPS verification with the locally held Vercel bypass; no secret was printed.
- An UptimeRobot account exists, but monitor creation, alert contacts, owners,
  thresholds, escalation schedule, and controlled alert/recovery proof remain
  unverified. No error/log drain exists.
- Knowledge staging backlog remains complete: Coastal 5/5 and Harbour 4/4
  synchronized, with no retryable or `sync_required` rows. Production Pinecone
  remains fail-closed.
- n8n, Twilio, Vapi/model live certification, privacy operations, external
  monitoring ownership, and a true backup restore remain pilot blockers. The
  verifier is ready, but restored-target execution, isolated Preview proof, and
  cleanup evidence need a real disposable restored project.

## Claude — health endpoint pushed; found platform-level SSO gate (2026-08-27)

Reviewed and pushed Codex's finished health-endpoint/monitoring commit
(`d1b2d84`); production READY at `dpl_3SG5Sm6Hr8sMtHNCustDUKyJe1K4`. Tested
`/api/health` over live HTTPS and found every URL this project has requires
Vercel SSO login (`ssoProtection.enabled=true`,
`all_except_custom_domains`, no custom domain configured) — the route's own
code is correctly public, but no external uptime monitor could ever reach
it as currently deployed. This is a platform-config finding, not a code
defect, and wasn't catchable by local/build-time testing.

No available Vercel MCP tool can generate the "Protection Bypass for
Automation" secret this needs (dashboard-only, by design — kept it out of
chat text). Presented three options; the user has no external monitor in
use, so left unresolved by choice rather than acted on. Nothing about
deployment protection was changed.

Proceeding next to the user-approved isolated Supabase restore drill (paused
— see below).

## Claude — external monitoring unblocked (2026-08-27)

User generated the Vercel bypass secret and created an UptimeRobot account.
Verified `/api/health` end-to-end with the bypass header (read from a local
`.env.local` entry, never typed into chat): `GET` and `HEAD` both return
`200 OK`, the expected `{"status":"ok"}` body, and correct no-store headers.
External monitoring is no longer blocked.

The restore drill is paused, not abandoned: no available Supabase MCP tool
can restore an actual backup (only fresh migration-based project/branch
creation is exposed), so doing the drill as specified needs either a lesser
migration-only substitute or the user restoring a real backup themselves via
the Supabase dashboard. Presented both options; user dismissed the question
without picking one, so this is holding for further direction rather than
proceeding on either path.

## Claude — QA pass finished on remaining pages (2026-08-27)

Finished the accessibility/console QA pass on Calls, Analytics, AI
Receptionist, Business Profile, and Connections. No console errors on any
page; `npm audit` rechecked clean. AI Receptionist's toggle switches use
proper `role="switch"` with descriptive names; form fields are properly
labeled.

Investigated four elements that looked unlabeled in the browser tool's
summary (KPI drill-through links, the setup checklist buttons, Connections'
capability jump-links, and the business-name input showing its placeholder
instead of its label) and verified each against source: all have correct
text content or a properly linked `<label>`. This is a confirmed `read_page`/
`find` tool display limitation, not an app defect — the same shape recurred
four times with source-level verification each time. No fixes needed; no
code changes this pass. This closes out the accessibility QA sweep started
with the sidebar fix.
