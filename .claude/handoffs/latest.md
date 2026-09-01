# Latest Handoff

Updated: 2026-09-01
Status: VERCEL PREVIEW-BUILD NOISE FIXED (vercel.json `ignoreCommand`)

## What happened

User asked to check Gmail for Vercel emails. Investigation via `get_thread`:

- Thread `1a0558498899ce0f` had grown to 34 "Failed preview deployment"
  emails (Aug 31 01:52 → Sep 1 01:03, still growing) for the real
  `ai-receptionist-dashboard` project — one per push to this task branch.
  Root cause confirmed: Preview environment secrets (`DATABASE_URL`,
  `AUTH_*`, provider modes, etc.) are branch-scoped to `master`/`staging`
  only (`docs/staging-foundation.md`), so any other branch's Preview build
  fails by design, every time. Not a regression, not a live-project issue.
- "Failed production deployment" emails checked separately: both threads
  are Aug 24–27, before the duplicate-Vercel-project cleanup
  (`docs/production-readiness.md`); one is literally the old deleted
  `ai-receptionist-dashboard-dsarao` project. Nothing since Aug 27 —
  production has been deploying clean.

User picked the fix: stop the failing builds at the source rather than
just filtering the emails. Added to `vercel.json`:

```json
"ignoreCommand": "if [ \"$VERCEL_GIT_COMMIT_REF\" = \"master\" ] || [ \"$VERCEL_GIT_COMMIT_REF\" = \"staging\" ]; then exit 1; else exit 0; fi"
```

Per Vercel's documented contract (`ignoreCommand`: exit 0 skips the build,
exit 1 continues it), this skips the build for every branch except
`master`/`staging`, which still build normally. Verified all three cases
locally (`task-branch → 0/skip`, `master → 1/build`, `staging → 1/build`)
before committing. Also updated `docs/staging-foundation.md`'s stale
"Preview branch tracking: enabled for all non-production branches" line to
note the new gate.

## Verification

- `node -e "JSON.parse(...)"`: `vercel.json` still parses.
- Manually ran the exact `ignoreCommand` shell logic for
  `VERCEL_GIT_COMMIT_REF` = the task branch, `master`, and `staging`;
  got skip/build/build respectively, matching intent.
- No app code changed — nothing to typecheck/lint/test beyond the JSON
  syntax check above.

## Important scope note

This only takes effect for builds on commits that carry this `vercel.json`
change. It's committed on `claude/launch-terminal-q0czdf` now, so pushes
to *this* branch stop triggering failed Preview builds immediately. It
will not affect other in-flight task branches (e.g. any Codex branch)
until they also carry this file — and will not affect `master`/`staging`
builds at all (the command explicitly always continues for those) until/
unless this reaches `master`, which still requires the user's own literal
push command per the standing auto-mode-classifier pattern.

## Next safe action

Nothing pending from this pass — it is closed pending the user's own
`master` push if/when they want this rule live for every branch platform-
wide. Standing priorities per the user's last direction remain, in order:
(1) live Knowledge/Pinecone wiring into the AI receptionist flow — blocked
on (2); (2) Twilio/Vapi live certification — paused, costs money, batched
with Supabase Pro upgrade, wait for explicit user go-ahead; (3) the
backup-restore drill — externally gated on plan tier.
