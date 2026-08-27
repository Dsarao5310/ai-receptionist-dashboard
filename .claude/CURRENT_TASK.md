# Current Task

Phase: **Business Knowledge reconciliation operations**

Status: **LOCAL FOUNDATION COMMITTED AND VERIFIED; LIVE RECONCILIATION NOT EXECUTED — 2026-08-27**

## Authoritative checkpoint

- `master` and `origin/master` are at `b91524c`.
- Protected Knowledge reconciliation operations and the whole-run `app_test`
  advisory lock are committed in `9a5b957`.
- The Nodemailer security update is committed in `42e8bad`; `b91524c` adds the
  npm override required for clean-environment dependency resolution.
- Before this documentation reconciliation, the working tree was clean except
  for the pre-existing untracked `.claude/worktrees/` directory. Current changes
  are limited to the authoritative Markdown updates recorded here.
- Staging and production remain verified at 19/19 database migrations.

## Knowledge state

- Isolated staging is live-certified for the existing authenticated Knowledge
  create/search/delete flow. Production has no Pinecone credential and remains
  fail-closed.
- Eight historical staging Knowledge rows remain `pending`. They have not been
  reconciled against Pinecone.
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
- No live Knowledge reconciliation, Pinecone mutation, remote database change,
  environment change, or provider certification was performed by this task.

## Approval boundary and next action

The next external phase requires explicit approval: confirm the intended
staging deployment contains `9a5b957` or later, authenticate as an authorized
staging owner, run dry-run first, then reconcile only the eight historical
pending rows and verify scoped database/Pinecone settlement, cross-workspace
negatives, sanitized logs, and cleanup.

Production Pinecone, deployments, environment changes, remote migrations,
provider writes, project removal, commits, and pushes remain separately gated.
