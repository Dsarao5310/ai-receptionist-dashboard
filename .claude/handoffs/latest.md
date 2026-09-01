# Latest Handoff

Updated: 2026-09-01
Status: VERCEL PREVIEW-BUILD NOISE FIXED, BOTH HALVES DONE (vercel.json + Gmail cleanup)

## What happened

User asked to check Gmail for Vercel emails, then to do both mitigations
offered rather than just one.

**Investigation** (`get_thread` on the relevant threads):

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

**Fix 1 — stop the builds** (committed `d47e77a`, pushed). Added to
`vercel.json`:

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

**Fix 2 — clean up the mailbox.** Checked this session's Gmail MCP tools
for a filter/rule-creation tool first — there isn't one, only label
create/apply and archive/trash/spam actions on existing mail. So a true
persistent "auto-archive all future matching mail" rule isn't buildable
here. Did the closest available thing: created label
`Vercel/Preview-Build-Noise`, applied it to all three threads above, and
removed `INBOX`/`UNREAD` from each (archived + marked read). Told the user
directly that this isn't a guaranteed persistent filter, just the nearest
available action — and that it's largely moot for this branch once Fix 1
is live, since the emails stop being generated at all.

## Verification

- `node -e "JSON.parse(...)"`: `vercel.json` still parses.
- Manually ran the exact `ignoreCommand` shell logic for
  `VERCEL_GIT_COMMIT_REF` = the task branch, `master`, and `staging`;
  got skip/build/build respectively, matching intent.
- Gmail actions confirmed via each tool's empty-success response
  (`label_thread`/`unlabel_thread` on all three thread IDs).
- No app code changed beyond `vercel.json`; nothing else to typecheck/
  lint/test.

## Important scope note

Fix 1 only takes effect for builds on commits that carry this
`vercel.json` change. It's committed on `claude/launch-terminal-q0czdf`
now, so pushes to *this* branch stop triggering failed Preview builds
immediately. It will not affect other in-flight task branches (e.g. any
Codex branch) until they also carry this file — and will not affect
`master`/`staging` builds at all (the command explicitly always continues
for those) until/unless this reaches `master`, which still requires the
user's own literal push command per the standing auto-mode-classifier
pattern.

## Next safe action

Nothing pending from this pass — it is closed pending the user's own
`master` push if/when they want the vercel.json rule live for every
branch platform-wide. Standing priorities per the user's last direction
remain, in order: (1) live Knowledge/Pinecone wiring into the AI
receptionist flow — blocked on (2); (2) Twilio/Vapi live certification —
paused, costs money, batched with Supabase Pro upgrade, wait for explicit
user go-ahead; (3) the backup-restore drill — externally gated on plan
tier.
