# Latest Handoff

Updated: 2026-08-27
Status: STAGING HISTORICAL KNOWLEDGE RECONCILIATION COMPLETE AND VERIFIED

## Repository checkpoint

- Local `master` and `origin/master`: Claude's documentation checkpoint
  `4899725`, following unrelated accessibility commit `d867931`.
  `origin/staging`: `64fa59a`.
- Knowledge reconciliation and whole-run `app_test` lock: `9a5b957`.
- Nodemailer security update: `42e8bad`; clean-install override: `b91524c`.
- Working tree contains the Knowledge operator scripts/package entry and this
  documentation reconciliation plus the pre-existing `.claude/worktrees/`.

## Completed behavior

- Workspace-scoped, content-free Knowledge status counts.
- Strict provider-free dry run and confirmed, bounded execute command.
- `business.edit` authorization with server-derived workspace/provider scope.
- Safe preview/start/completion/failure audits and no replay of
  `sync_required` rows.
- Cross-tenant, parser, authorization, disabled-provider, bounded-batch,
  settlement-warning, and failure-path tests.
- Whole-run Postgres advisory lock prevents concurrent Vitest processes from
  dropping or rebuilding the shared disposable schema underneath one another.

## Verification

- Accepted uncontested suite: 42/42 files and 564/564 tests passed.
- TypeScript, full lint, production build, and client-secret audit passed.
- Two deliberately overlapping schema-hardening runs both passed 3/3; the
  second waited for the first lock holder before rebuilding `app_test`.

## Runtime boundary and next action

- The approved `master:staging` fast-forward completed. Isolated staging
  deployment `dpl_5LyptvgEnbMsbLBx6zfQy8YT2TVa` is READY at `64fa59a`.
  Production deployment `dpl_Ei7f5WEVuFtko1zFhYoaBNhXRh6N` is READY at
  `4899725` after Claude's push; its one-hour runtime-error scan is clean.
- Provider-free staging dry runs reported 4 eligible rows in Coastal and 4 in
  Harbour, with 0 errors and 0 `sync_required`; both preview audits recorded.
- After explicit approval, bounded execute processed all 8 rows: each workspace
  reported 4 attempted, 4 synchronized, 0 superseded/local-only/needs-attention,
  0 remaining retryable, 0 `sync_required`, and a recorded completion audit.
- Read-only post-state is Coastal 5 synced of 5 total and Harbour 4 synced of 4
  total. A Coastal actor was denied Harbour status access before provider work.
- Shared CLI guards now have 6 passing focused Vitest cases covering bounded
  input, staging-project matching, actor fail-closed behavior, active-owner
  resolution, and content-free preview projection.
- The command is not wired into dashboard UI or scheduling.
- No historical staging backlog remains. Production remains fail-closed without
  a Pinecone credential and is a separate approval/certification phase.

## Claude — sidebar accessibility fix, unrelated to Knowledge (2026-08-27)

Ran a UI/accessibility QA pass while Codex worked the reconciliation
dry-runs above. Found and fixed a real WCAG 2.4.4/4.1.2 gap: the sidebar's
default collapsed state removed every nav link's visible label from the DOM
and relied on a purely visual tooltip with no aria-label, leaving all 10
links with no accessible name in the default view. Added
`aria-label={item.label}` to the Link in `src/components/shell/Sidebar.tsx`
and verified live via the accessibility tree after reload — all 10 links
now report correct names.

Checked a second candidate (StatusStrip's links) and ruled it out after
reading the source — plain unsuppressed text content, very likely a tool
display artifact rather than a real gap. Could not visually verify the
375px mobile layout (window resize didn't take effect in this browser
environment); confirmed via code instead that `MobileBottomNav.tsx` always
renders visible labels and isn't affected.

Typecheck and lint pass. Skipped the full test suite to avoid contending
with the concurrent database-backed dry-run work; no dedicated Sidebar test
exists to extend. Committed in `d867931`, scoped to just that one file —
pushed as an ancestor of `4899725`.

## Claude — QA pass continued through Codex's live execute mode (2026-08-27)

Checked Conversations, Appointments, Customers (+ its detail dialog), and
Settings while Codex ran the actual staging execute-mode reconciliation
(now complete per the section above: 5/5 Coastal, 4/4 Harbour synced, 0
retryable/sync_required remaining). All clean: correct accessible names on
every interactive element, no console errors, the customer dialog has
proper `role="dialog"` with an accessible name and closes on Escape,
Settings fields are properly labeled. No new issues found beyond the
sidebar fix already committed; no code changes this round.

## Claude — committed and pushed Codex's finished reconciliation tooling (2026-08-27)

Codex's docs marked the operator CLI tooling finished: four scripts
(dry-run, status, execute, shared cli helpers), a six-test file, three new
`package.json` commands, and `env.ts`/`pinecone.ts` comment corrections
reflecting live mode now being reachable when configured. Reviewed every
file directly for hardcoded secrets before touching git — none found, test
fixtures use fake `example.test` data only. Ran typecheck, lint, the
focused `operator-cli.test.ts` suite (6/6), and the client-secret audit
(56 artifacts) — all pass. Committed as `6cd661d` (attributed to Codex),
excluding `.claude/worktrees/`, and pushed.

Production deployment `dpl_2rJpPZnT3hgovRHtJVdiV1HXKprk` is READY at
`6cd661d`. Scanned runtime errors: 0 in the last hour; the only entry in a
24h window is the already-known, already-resolved `provider_document_id`
not-null violation from the isolated staging deployment-mismatch bug
documented days earlier — a different deployment, not a regression here.
