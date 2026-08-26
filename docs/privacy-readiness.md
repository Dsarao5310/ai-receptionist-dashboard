# Call privacy readiness

Status: **APPLICATION-READY + DATABASE-TEST VERIFIED** for the local consent,
retention, access, and sensitive-content deletion foundation. Recording capture
remains disabled at the Vapi boundary.

## Implemented controls

- Per-workspace recording mode defaults to `disabled`.
- Explicit-consent mode requires bounded notice text; retention is constrained
  to 1–365 transcript days and 1–90 recording days.
- Every call receives tenant-bound privacy state and a transcript expiry.
- Consent evidence is append-only and contains only decision, source, policy
  version, actor when applicable, and timestamps.
- Recording storage is a server-only gate that requires both explicit-consent
  mode and the latest consent state to be granted.
- Delayed consent events cannot regress a later denial or withdrawal.
- Staff receive operational call records with summaries, previews, and raw
  transcripts removed. Managers, owners, and platform operators retain
  sensitive access within an authorized workspace.
- Owners and platform operators can change policy or erase sensitive content;
  managers and staff cannot. Successful mutations are audited without notice
  text, transcript content, or recording locators.
- Withdrawal, denial, explicit erasure, and bounded expiry can clear transcript
  lines, summary, preview, recording locator, and recording duration while
  preserving call outcome, timing, appointment linkage, consent evidence, and
  audit history.
- Expiry processing is bounded and non-blocking with `FOR UPDATE SKIP LOCKED`.
- A daily Vercel Cron configuration targets the server-only purge route at
  03:17 UTC. It is a no-op under the default disabled mode.
- Scheduled mode requires an exact dedicated 32+ character bearer secret.
- An expiring Postgres lease prevents overlapping invocations; work is bounded
  to 10 workspaces and 25 calls per workspace by default.
- Completed and failed runs store only timestamps, status, duration, aggregate
  counts, and a normalized error code—never tenant ids or sensitive content.
- Platform operators have a server-rendered, read-only `/admin/privacy` health
  view that classifies disabled, never-run, healthy, missed, failed, running,
  and stale states. Authorization occurs before the database read, and the page
  exposes no tenant detail or operational mutation.
- Owners and platform operators have a server-backed Settings Privacy tab for
  reviewing and changing recording mode, bounded retention, and consent notice.
  It displays policy version and whether automatic deletion is scheduled, while
  clearly stating that policy changes do not connect Vapi or start recording.
- Managers and staff do not receive the policy or render the tab. The Server
  Action separately requires `privacy.manage`, validates untrusted input, uses
  the server-authorized workspace, and returns only safe errors and the safe
  policy DTO.
- Explicit erasure uses a durable tenant-bound request with constrained
  `pending_identity`, `verified`, `completed`, and `rejected` states. A
  composite foreign key makes cross-workspace call/request pairs invalid and a
  partial unique index permits only one active request per call.
- Request records contain only call id, constrained internal case reference,
  state, verification method, rejection reason, authorized actors, timestamps,
  and aggregate deletion outcomes. The runtime role cannot delete them.
- Identity verification is a separate owner/operator transition recording a
  completed out-of-band method. The UI explicitly says its checkbox is an
  attestation, not proof. Execution also requires the exact fresh phrase
  `ERASE <request-id>` and explicitly says that phrase is not reauthentication.
- The sensitive-content erase and request completion happen in one database
  transaction. Replays return the completed request without deleting or
  auditing a second time. Rejected requests cannot later execute.

## Verification

On 2026-08-24, the official Supabase CLI generated
`20260825012531_call_privacy_lifecycle.sql` and
`20260825015735_privacy_purge_scheduler.sql`, then generated
`20260825025737_privacy_erasure_requests.sql`. The isolated `app_test` schema was
rebuilt from all migrations and exercised through production repositories and
the scheduled executor.

- 12 privacy policy/database/scheduler/request tests, 6 cron auth/route tests,
  and the 31/31 focused policy/request action/input/tab gate passed.
- Focused scheduler, privacy, and configuration gate: 27/27 tests.
- Privacy operations health and authorization suite: 5/5 tests; focused
  privacy/scheduler/health gate: 23/23 tests.
- Privacy staging preflight validators and disposable-database inspection: 5/5
  tests. The deliberately invalid CLI smoke test blocked before database access
  and printed no values.
- Consolidated typecheck, lint, and test gate: 508/508 tests across 35 files.
- Production build: 26 routes, including one server-only privacy cron route and
  one server-rendered platform-operator health route; no public
  privacy/recording endpoint.
- Generated client-secret audit: 49 artifacts passed without printing values.
- In-app browser QA passed at 1440x900 and 375x812 against the isolated
  migration-complete `app_test` schema. It verified responsive layout, no page
  overflow, deep-linked tab visibility, invalid/valid/dirty/discard behavior,
  and no fresh console errors after the final interaction. No policy was saved.
- The erasure panel later rendered at 1440x900 with minimal completed/rejected
  rows. No request transition or erasure was submitted. Pending-dialog and
  second-phase mobile rendering were not verified after the browser URL safety
  policy blocked the stale tab following a disposable-schema restart.
- Rendering is not claimed for `/admin/privacy`: the permitted in-app Browser
  retained that safety block, and it was not bypassed.
- `privacy:preflight` is locally/disposable-database verified only. No real
  staging target was queried by this phase.

## Not implemented or certified

- No legal approval of consent language, retention values, or jurisdictional
  requirements.
- No automated identity-proofing provider, customer intake/portal,
  notifications, true reauthentication, or live operator certification. The
  current identity step records an authorized operator's out-of-band check; it
  does not perform or independently prove that check.
- The cron definition and route are deployed, but purge mode remains disabled;
  no configured cron secret, external monitoring, alert owner, retry escalation,
  or recovery certification exists. The operator page is not an external alert.
- Remote schema parity and privacy backfills are verified through the 17-file
  staging and production checkpoint. No live purge exercise, provider recording
  ingestion, live call, export workflow, customer identity-verification flow,
  or live certification exists.

Before enabling recording, approve the policy, apply and verify the migration in
isolated staging, verify disabled mode first, configure the dedicated secret,
assign run/failure monitoring, implement the user/operator workflow, and run
hostile live tests for authentication, overlapping delivery, consent ordering,
withdrawal, erasure, expiry, access, URL leakage, retries, and tenant isolation.
