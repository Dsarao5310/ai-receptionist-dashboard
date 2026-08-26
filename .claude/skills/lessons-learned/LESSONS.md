# Lessons learned — index

Seeded from the UI polish session on 2026-08-25/26 (`.claude/handoffs/claude-ui-notes.md`
has the full narrative for any entry below). Add new entries per `SKILL.md`'s format.

## CSS / layout clipping

### Negative chart margin clips its own axis labels
**Where:** `src/features/overview/TrendChart.tsx` (Recharts `AreaChart`)
**Symptom:** Y-axis numbers showed only their last digit or two — "24" rendered
as "|4", "18" as "|8".
**Root cause:** `margin={{ left: -16 }}` was used to tighten the visual gap
between the card padding and the plot area. Recharts positions the `YAxis`
tick labels *inside* that same margin-adjusted coordinate space, so the
negative margin dragged the axis labels left along with the plot — past the
`CardContent` padding and into the outer `Card`'s `overflow-hidden` clip
region.
**Fix:** Removed the negative margin (`left: 0`); `YAxis`'s own `width={32}`
already reserves enough space without the hack.
**Recognize it again:** Any Recharts container with a negative `margin` value
paired with an outer `overflow-hidden` ancestor — the negative margin moves
*everything in the chart's coordinate space*, not just the plot lines.

### CardHeader's default layout silently breaks title+description pairs
**Where:** `src/components/ui/Card.tsx`'s `CardHeader`, and ~18 call sites
across Settings, Connections, admin/settings, admin/workflows, admin/calendar,
and `TopServices.tsx`
**Symptom:** A card's title and its one-line description rendered side by
side on the same line instead of stacked, e.g. "Account" ... "How you appear
inside this workspace." pushed to opposite ends of the header row.
**Root cause:** `CardHeader`'s default class was
`flex items-center justify-between` — correct for a title+action-button pair
(spread to opposite ends), wrong for a title+description pair (should stack).
The established convention was to override per call site with
`flex-col items-start gap-1`, but that's opt-in and easy to forget — ~18
places forgot it, including code written in the same session.
**Fix:** Changed `CardHeader`'s default to
`flex flex-col items-start gap-1 p-5 pb-0` — the exact string already
copy-pasted everywhere as the "correct" override. Every genuine row-layout
usage already had its own explicit `flex-row`/`sm:flex-row` override or
wrapped the title block in a `<div>` before a sibling badge/button, so the
default flip changed zero correct layouts.
**Recognize it again:** A `<CardHeader>` with no `className` whose only
children are `CardTitle` + `CardDescription` (not wrapped in a `<div>`, no
sibling action element) is the exact broken shape. `grep` for bare
`<CardHeader>`/`<CardHeader className="p-...">` (no `flex-col` and no
`flex-row`) and check what's inside.

### tailwind-merge "last one wins" silently clobbers conditional classes
**Where:** `src/components/shared/KPICard.tsx` (the `href`/Link render branch)
**Symptom:** The hero KPI tile was fully invisible in light mode — white text
on a near-white background.
**Root cause:** The `href` branch appended fixed classes
(`"bg-surface border border-border rounded-xl"`) unconditionally *after*
`sharedClassName`, which already carried the correct `hero`/`raised`
conditional classes (`bg-hero`, `border-transparent`, `rounded-2xl`). Because
`cn()` is `tailwind-merge`, same-conflict-group classes declared later always
win, so the unconditional defaults silently overrode the correct hero styling
whenever `hero && raised && href` were all true at once.
**Fix:** Made every class in the `href` branch conditional on the same
`hero`/`raised` flags `sharedClassName` already uses, instead of re-declaring
fixed defaults that fight it.
**Recognize it again:** Any `cn(...)` call with a conditional class earlier in
the string and an *unconditional* class in the same Tailwind conflict group
later in the string. The bug only shows when the conditional actually applies
— easy to miss in review, since the "off" case looks fine.

## SVG / mini-chart rendering

### A near-zero bar's corner radius rounds it into a dot
**Where:** `src/components/shared/Sparkline.tsx` (`variant="bars"`, now
replaced by `variant="line"` for KPI cards — see below)
**Symptom:** Sparklines on low-activity periods (e.g. "Today") looked like a
row of dots instead of short bars.
**Root cause:** Near-zero values were floored to a 2px-tall bar so they stay
visible, but the corner radius was computed only from the bar's *width*
(`barWidth / 2.4`), capped at 2.5px — never checked against the bar's own
height. A ~2.5px radius on a 2px-tall bar exceeds half its height, which
doesn't round a short bar, it turns it into a small circle.
**Fix:** `radius = Math.min(barWidth / 2.4, h / 2, 2.5)` — capped by the bar's
own height too.
**Recognize it again:** Any rounded-rect/bar mark whose radius formula doesn't
also clamp against the mark's own shorter dimension.

### KPI card sparklines redesigned: bars → smooth line + gradient (2026-08-26)
**Where:** `src/components/shared/KPICard.tsx`, `src/components/shared/Sparkline.tsx`
**Symptom:** Not a bug — a genuine "this doesn't look good" design complaint.
The bar variant (mostly-flat gray bars, only the last one at full opacity)
read as thin and uninteresting.
**What changed:** Researched real products (June's dashboard, general 2026
KPI-card best practice) — a time-series trend belongs on a line/area chart,
not bars (bars are for categorical comparison, matching `dataviz` skill
guidance too). Added a lightweight Catmull-Rom-to-Bezier smoothing helper
(`smoothPath()`) so the line reads as a real curve instead of jagged
connect-the-dots at this small size, kept the existing gradient-fill area
under it, and switched `KPICard` from `variant="bars"` to `variant="line"`
with direction-matched tone (`success`/`danger`/`muted`) instead of always
muted-gray for non-hero, non-good-direction tiles.
**Recognize it again:** Not a recurrence risk — recorded so a future session
doesn't revert to bars without knowing why line was chosen, and knows the
`smoothPath()` helper already exists before reaching for a charting library
for a two-point-per-metric mini trend.

## Decorative elements without a stated purpose

### An unlabeled shaded region on a chart reads as a bug, not a feature
**Where:** `src/features/overview/TrendChart.tsx`
**Symptom:** User asked "what is this?" about a light rectangular tint over
the right portion of the trend chart.
**Root cause:** A `ReferenceArea` shaded the final ~quarter of the period as
the "recent window," with no label, legend entry, or caption anywhere near
it — and the information it carried (this is the most recent data) was
already fully inferable from the x-axis dates, so it added no value a reader
couldn't already get by reading the chart normally.
**Fix:** Removed it rather than adding a label to justify it — it didn't earn
its keep even labeled.
**Recognize it again:** Any chart decoration (shaded band, reference line,
annotation) with no adjacent text explaining what it means is a design smell,
not a subtle nice-to-have. If it needs a caption to make sense, ask first
whether the caption alone would've been more useful than the visual.

## Provider boundary safety

### TypeScript provider return types are not runtime validation
**Where:** `src/server/integrations/knowledge/contracts.ts`,
`src/server/integrations/knowledge/operations.ts`
**Symptom:** A retrieval adapter could return malformed matches or throw a raw
SDK error, and the service would pass that value or exception through unchanged.
Invalid search input also escaped as a raw Zod error while writes used the
project's safe provider-error contract.
**Root cause:** `KnowledgeProviderClient.search()` had only a TypeScript return
type. The search service used `parse()` for input and trusted the provider result
without runtime validation or the error normalization already used by writes.
**Fix:** Validate search input explicitly, validate provider matches at the
server boundary, enforce the requested result limit, and normalize retrieval
failures to a safe context-specific message.
**Recognize it again:** Any external adapter result used solely because its
interface says it has the right shape; check for runtime parsing and safe error
normalization on both input and output paths.

### Provider match content is not tenant authority
**Where:** `src/server/integrations/knowledge/operations.ts`,
`src/server/db/repositories/knowledge-sync.ts`
**Symptom:** A validly shaped search match could carry stale, deleted, unknown,
or cross-namespace title/content and the service would return it directly.
**Root cause:** Namespace isolation was delegated to the provider, and provider
metadata was treated as the final business response instead of an untrusted
ranked identifier.
**Fix:** Resolve every bounded provider document id through the authorized
workspace repository, discard unknown/inactive/deleted ids, and hydrate returned
title/content/id from local Business Knowledge while retaining only provider
ranking score.
**Recognize it again:** Any search/vector provider returning business content
directly; use provider ids/scores for ranking, then re-authorize and rehydrate
from the tenant-scoped source of truth.

### A terminal state still retries if the selector includes it
**Where:** `src/server/db/repositories/knowledge-sync.ts` (`pending()`),
`src/server/integrations/knowledge/operations.ts` (`reconcile()`)
**Symptom:** A Knowledge row marked `sync_required` after a non-retryable
provider outcome would be selected by the next automatic reconciliation pass.
**Root cause:** The retry query used `provider_sync_state <> 'synced'`, which
silently grouped the manual-attention state with retryable `pending`/`error`.
The state label alone does not enforce retry policy.
**Fix:** Select only `pending` and `error` for automatic reconciliation and keep
a database regression proving `sync_required` is attempted exactly once.
**Recognize it again:** Any retry worker expressed as "everything not done";
enumerate explicitly retryable states so terminal/manual states cannot enter by
default when the state machine grows.

### A version-guarded stale failure can still report the wrong outcome
**Where:** `src/server/db/repositories/knowledge-sync.ts` (`markFailed()`),
`src/server/integrations/knowledge/operations.ts` (`synchronize()`)
**Symptom:** An older provider request that failed after a newer revision had
already settled returned `needs_attention`, even though its version-guarded
database update correctly changed zero rows.
**Root cause:** Successful settlement returned whether the version was current,
but failure settlement returned `void`; the service therefore could not
distinguish a current failure from a superseded failure.
**Fix:** Make `markFailed()` return whether its guarded update affected a row
and report `superseded` when it did not.
**Recognize it again:** Paired success/failure settlement paths where only one
returns an affected-row/current-version signal; stale races must produce the
same superseded semantics on both paths.

### A version guard alone does not settle concurrent workers once
**Where:** `src/server/db/repositories/knowledge-sync.ts` (`markSynced()`,
`markFailed()`)
**Symptom:** Two workers processing the same sync version could race; a late
failure could overwrite an earlier `synced` result, or a late success could
clear a manual `sync_required` state.
**Root cause:** Settlement updates checked only `provider_sync_version`. Same-
version workers all passed that guard regardless of whether another worker had
already moved the state to a terminal result.
**Fix:** Allow settlement updates only while the current state is explicitly
retryable (`pending` or `error`), in addition to matching the version.
**Recognize it again:** Any idempotent worker with version checks but no state-
transition predicate; verify both version and allowed source states in the
atomic update.

### A server-managed immutable mapping should not retain UPDATE
**Where:** `supabase/migrations/20260825215335_knowledge_provider_foundation.sql`,
`supabase/migrations/20260826033517_knowledge_namespace_immutability.sql`
**Symptom:** `app_runtime` had table-level `UPDATE` on
`knowledge_provider_namespaces`, allowing the application role to retarget a
workspace's provider namespace even though the repository only inserts once and
reads afterward.
**Root cause:** The foundation migration granted a generic read/write bundle
instead of deriving privileges from the repository's actual operations.
**Fix:** Preserve `SELECT`/`INSERT` and revoke `UPDATE` in a forward-only
migration, with executed-schema regression coverage.
**Recognize it again:** Any trusted server mapping described as opaque,
server-issued, or immutable while its runtime role still has table-level update
or delete; compare grants directly with real repository methods.

### Bounded provider results can still create an N+1 query path
**Where:** `src/server/integrations/knowledge/operations.ts`,
`src/server/db/repositories/knowledge-sync.ts`
**Symptom:** Rehydrating at most 20 provider matches looked harmless, but issued
one remote Postgres query per match, multiplying transaction-pooler round trips.
**Root cause:** Tenant re-authorization was added correctly but implemented as
`Promise.all()` over a single-id repository lookup.
**Fix:** Deduplicate and limit ranked provider ids, fetch all active local rows
in one workspace-scoped `IN` query, then restore provider ranking order from an
in-memory map.
**Recognize it again:** Any bounded loop that calls a repository method; bounded
N+1 is still N+1 when the database is remote, so prefer one array/batch query.

### External success and local settlement failure must not share one retry catch
**Where:** `src/server/integrations/knowledge/operations.ts` (`synchronize()`)
**Symptom:** A provider upsert/remove could complete, then a failed local
`markSynced()` call recorded the document as retryable `error`, allowing
reconciliation to repeat an external effect that had already succeeded.
**Root cause:** The provider call and its database settlement were inside the
same `try`/`catch`, so every exception was normalized as a provider failure.
**Fix:** Separate provider execution from post-success settlement; if settlement
fails, persist `sync_required` with a safe settlement-specific code and keep the
row out of automatic reconciliation.
**Recognize it again:** Any external side effect and local acknowledgement in
one catch block; once the external call returns successfully, later uncertainty
must use a manual-attention state rather than an automatic retry state.

### Provider attention is not the same as a rejected local save
**Where:** `src/server/actions/configuration.ts`,
`src/lib/store/workspace-stores.tsx`, `KnowledgeManager.tsx`
**Symptom:** A Knowledge write persisted locally but returned
`needs_attention`; the server action projected that as `ok: false`, so the
optimistic store rolled the accepted row back and the UI claimed it was not
saved until a refresh made it reappear.
**Root cause:** One boolean result tried to represent two independent outcomes:
local persistence and provider synchronization.
**Fix:** Project provider attention as `ok: true` with a warning, keep the
optimistic local change, refresh server state, and suppress the ordinary success
toast when the warning toast is shown.
**Recognize it again:** Any mutation where durable local state succeeds but a
secondary provider step fails; do not feed the secondary failure into rollback
logic for the already-accepted primary write.

## Test / verification environment (not real bugs)

### Queue tests must scope assertions to their target fixture
**Where:** `src/server/integrations/knowledge/knowledge.test.ts`
**Symptom:** The `sync_required` no-retry regression expected reconciliation to
return an empty array, but the seeded workspace intentionally contained other
pending Knowledge rows that were correctly processed.
**Root cause:** The test treated a shared seeded queue as if it contained only
the row created inside that test.
**Fix:** Assert that the target id is absent from reconciliation results and
that its provider document is attempted exactly once; allow unrelated seeded
pending rows to reconcile normally.
**Recognize it again:** Any queue/reconciliation test using the seeded database;
assert on the target operation/id rather than global queue emptiness unless the
test explicitly cleared all fixtures first.

### `Error: fixture missing: <email>` across many unrelated test files
**Symptom:** A `npm run check` run fails 50-80 tests across 5+ files, all with
the identical `fixture missing: alex@coastalbloom.example`-shaped error, with
no relationship to whatever was actually just changed.
**Root cause:** Hosted Postgres connection-pooler contention — usually because
Supabase MCP queries (or another agent/session) were running concurrently
against the same `app_test` schema while the suite ran.
**Fix:** Not a code fix. Re-run once nothing else is hitting the same hosted
database concurrently; confirm the failures disappear.
**Recognize it again:** The signature is the tell — many files, one identical
fixture-lookup error, zero relation to the diff. Don't start debugging
application code for this pattern; check for concurrent DB access first.

### Stale console errors survive across navigations in the same tab
**Symptom:** A browser tab shows a console error (parse error, failed RSC
fetch, an import that no longer exists) for a file that's already been fixed
and re-verified via `npm run typecheck`.
**Root cause:** Turbopack/HMR error overlays and the browser's own console
buffer can persist a stale entry from before the fix landed, timestamped
before the corresponding edit.
**Fix:** Not a code fix. Open a genuinely fresh tab (or hard-reload) and
re-check; compare the error's timestamp against when the fix was saved before
treating it as live.
**Recognize it again:** Check the timestamp on the console error first. If
it's older than the last edit to the file it complains about, it's stale.
