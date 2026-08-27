# Current Task

Phase: **Business Knowledge reconciliation operations**

Status: **STAGING HISTORICAL KNOWLEDGE RECONCILIATION EXECUTED AND VERIFIED — 2026-08-27**

## Authoritative checkpoint

- Local `master` and `origin/master` are at Claude's documentation checkpoint
  `4899725`, which follows sidebar accessibility commit `d867931`;
  `origin/staging` remains isolated at `64fa59a`.
- Protected Knowledge reconciliation operations and the whole-run `app_test`
  advisory lock are committed in `9a5b957`.
- The Nodemailer security update is committed in `42e8bad`; `b91524c` adds the
  npm override required for clean-environment dependency resolution.
- The working tree contains the Knowledge operator scripts/package entry and
  documentation reconciliation plus the pre-existing untracked
  `.claude/worktrees/`; Claude's sidebar and interim documentation are committed
  separately in `d867931` and `4899725`.
- Staging and production remain verified at 19/19 database migrations.
- The approved `master:staging` fast-forward deployed `64fa59a`. Isolated
  staging deployment `dpl_5LyptvgEnbMsbLBx6zfQy8YT2TVa` is READY at that
  commit. Production deployment `dpl_Ei7f5WEVuFtko1zFhYoaBNhXRh6N` is READY
  at `4899725`, with a clean one-hour runtime-error scan.

## Knowledge state

- Isolated staging is live-certified for the existing authenticated Knowledge
  create/search/delete flow. Production has no Pinecone credential and remains
  fail-closed.
- The eight historical staging Knowledge rows have been reconciled to Pinecone.
  Coastal Bloom now has 5 synchronized rows total and Harbour Dental has 4;
  both have 0 pending, 0 retryable errors, and 0 `sync_required`.
- Authorized provider-free dry runs completed for both staging workspaces:
  Coastal Bloom reported 4 eligible pending, 0 retryable errors,
  0 `sync_required`, and 1 already synced; Harbour Dental reported 4 eligible
  pending, 0 retryable errors, 0 `sync_required`, and 0 synced. Both attempted
  0 rows and recorded content-free preview audits. Read-only status checks
  independently confirmed the same counts and audits.
- The committed command is not wired into dashboard UI or a schedule. Dry run
  is provider-free; execute requires `business.edit`, an exact confirmation,
  enabled provider mode, and a batch limit of at most 100.
- Workspace scope comes only from the verified AuthContext. Client input cannot
  select a workspace, namespace, provider record, index, or credential.
- `sync_required` remains a manual-attention state and is excluded from replay.

## Verification

- Accepted uncontested gate: 42/42 test files and 564/564 tests passed.
- TypeScript, full lint, production build, and the client-secret audit passed.
- Concurrency proof for the new test lock: two schema-hardening Vitest processes
  launched two seconds apart both passed 3/3; the second completed in about 57
  seconds versus 30 seconds for the first, proving it waited for exclusive
  `app_test` ownership instead of racing the schema rebuild.
- The new local dry-run and read-only status commands pass TypeScript and focused
  ESLint. They verify the expected Supabase project, enforce the `app` schema,
  authorize an active workspace owner with `business.edit`, expose only
  content-free counts, and cannot enter execute mode.
- Shared targeting and actor-resolution guards now have 6 focused offline tests
  covering CLI parsing, bounded limits, direct-host/pooler project matching,
  wrong-project rejection, inactive-owner filtering, no fallback after an
  invalid explicit actor, and content-free audit projection. All 6 pass through
  the repository's normal Vitest configuration.
- Read-only Vercel inspection found no Production runtime error clusters in the
  one-hour window after deployment `dpl_Ei7f5WEVuFtko1zFhYoaBNhXRh6N` reached
  READY.
- The dry runs wrote only the expected preview audits. No Pinecone/provider call,
  Knowledge-row mutation, environment change, migration, or production action
  was performed.
- With explicit user approval, execute mode then processed exactly 4 Coastal and
  4 Harbour rows. Each workspace reported 4 attempted, 4 synchronized,
  0 superseded, 0 local-only, 0 needs-attention, 0 remaining retryable, and
  0 `sync_required`; both completion audits recorded successfully.
- Independent post-execution status checks confirmed the final 5/5 Coastal and
  4/4 Harbour synchronized totals. A Coastal actor was denied Harbour status
  access before any provider call, preserving the cross-workspace boundary.

## Approval boundary and next action

The staging historical-backlog phase is complete. No retryable or
manual-attention Knowledge rows remain. Future reconciliation should be run only
when content-free status shows a new retryable backlog and must remain
dry-run-first, bounded, authorized, and audited.

Production Pinecone, deployments, environment changes, remote migrations,
provider writes, project removal, commits, and pushes remain separately gated.

## Claude — unrelated sidebar accessibility fix (2026-08-27)

Separate from the Knowledge reconciliation work above: ran a UI/accessibility
QA pass on `Sidebar.tsx`. Found a real WCAG 2.4.4/4.1.2 gap, not cosmetic —
the sidebar's default state is collapsed, which fully removes the visible
label span from the DOM and relies on a purely visual Radix tooltip (no
aria-label wiring), leaving every nav link with no accessible name in the
default view.

Fixed with `aria-label={item.label}` directly on the Link (one line,
`src/components/shell/Sidebar.tsx`). Verified live by reloading the
authenticated dashboard and reading the accessibility tree: all 10 sidebar
links now report their correct accessible name. Ruled out a second
candidate (StatusStrip's icon+text links) after reading its source — the
text there is plain, unsuppressed content, so it's very likely a tool
display artifact, not a real gap; left unchanged. Could not visually verify
the 375px mobile layout (window resize didn't take effect in this
environment), but confirmed via code that `MobileBottomNav.tsx` always
renders visible text labels and isn't affected by the same bug.

Typecheck and lint pass; no dedicated Sidebar test file exists to extend.
Skipped the full test suite to avoid contending with the concurrent
Knowledge-reconciliation dry-run work on the shared database. Committed in
`d867931`, scoped to just that one file, and pushed as an ancestor of `4899725`.

## Claude — QA pass continued while Codex ran live execute mode (2026-08-27)

While Codex ran the actual staging execute-mode reconciliation above, checked
Conversations, Appointments, Customers (including its detail dialog), and
Settings for the same class of issue. All clean: every interactive element
(filters, sort buttons, row links, form fields) has a correct accessible
name, no console errors on any page, the customer detail dialog uses proper
`role="dialog"` with an accessible name and closes correctly on Escape, and
Settings form fields are properly labeled. No new issues found — the sidebar
fix above was the one real gap. No code changes this round.

## Claude — committed and pushed Codex's reconciliation tooling (2026-08-27)

Once Codex's docs marked the reconciliation code finished (not just the
live run — the four operator scripts, six-test file, `package.json`
entries, and `env.ts`/`pinecone.ts` comment corrections), reviewed every
file for hardcoded secrets (none found; test fixtures use fake
`example.test` data only), then ran typecheck, lint, the focused
`operator-cli.test.ts` suite (6/6), and the client-secret audit (56
artifacts) — all pass. Committed in `6cd661d` (attributed to Codex),
excluding `.claude/worktrees/`, and pushed.

Production deployment `dpl_2rJpPZnT3hgovRHtJVdiV1HXKprk` is **READY** at
`6cd661d`. Runtime error scan: clean for this deployment (0 errors in the
last hour); the only error in a wider 24h scan is old and already resolved
(the `provider_document_id` not-null violation from the isolated staging
deployment-mismatch bug documented days earlier, tied to a different,
already-fixed deployment — not a regression from this push).
