# Claude's UI/look-and-feel notes

Separate from `claude-notes.md` (the code-review track from the other Claude
session — see `codex-handoff.md`'s file-ownership rules). This file tracks a
different task: a full look-and-feel audit and polish pass on the dashboard,
requested directly by the user while Codex works on backend/email in the same
tree. Scope is UI-only — no backend/provider files touched.

## 2026-08-25 — functional + responsive audit, bugs found and fixed

Signed in as each dev account (Alex Rivera/owner, Sam Fadez/platform operator)
against the local dev server and walked every route, every filter, every
toggle, every time-range control, at 375 / 768 / 1440px. Screenshots were not
available this session (the Browser pane's compositor requires the pane to be
visibly open on the user's device, and the user has no device access right
now — confirmed after trying a fresh foreground tab, waiting, and zoom, all
with the same "pane not displayed" error). Verification instead used the
accessibility tree, console/network logs, and computed-style/bounding-rect
checks via JS — real DOM state, just no pixels.

Also discovered `computer` clicks by coordinate are unreliable while the pane
isn't composited (correct bounding-rect coordinates still didn't register on
Radix Select options). Switched to dispatching full pointer/mouse event
sequences via `javascript_tool` for every interactive test from that point on
— reliable throughout.

### Bugs found and fixed

1. **Dishonest empty-state copy** — `RecentActivity.tsx` and
   `RecentConversations.tsx` on Overview said "No activity/conversations in
   this range" / "try a wider date range," but `useOverviewData.ts` never
   scopes those two panels to the selected date range (they're always the
   most-recent-N globally, by design — only the KPI row and trend chart are
   range-scoped). Fixed the copy to stop claiming range-awareness it doesn't
   have.
2. **Missing `aria-pressed`** on the Today/7D/30D/90D/Custom segmented
   control in `DateRangeControl.tsx` (plain custom buttons, not Radix Tabs —
   the List/Calendar and Day/Week/Month switches elsewhere already use real
   Radix Tabs, which supplies `aria-selected` correctly, so those were a false
   alarm). Added `role="group"` + `aria-pressed` per button.
3. **Contradictory provider-error messaging** — `IntegrationCard.tsx` and
   `IntegrationDrawer.tsx` rendered `record.lastError.message` whenever it was
   present, with no check against `record.connection`. Gmail's real state is
   `not_configured` (matches `CURRENT_TASK.md`'s explicit no-live-Gmail scope)
   but the leftover seeded `lastError` ("Email is being checked less often
   than usual") still rendered underneath the "Not configured" badge — reads
   as an active-but-degraded connection when nothing is connected at all.
   Gated the error block on `record.connection !== "not_configured"`.
4. **Real horizontal-overflow bug at tablet width (768px)** — Analytics page
   overflowed the viewport (852px content in 758px available). Root cause:
   `ChannelPerformance.tsx`'s `Table minWidth="min-w-[520px]"` sits inside a
   `grid gap-4 lg:grid-cols-2` container; below the `lg` breakpoint that's a
   single ~462px-wide column, narrower than the table's minimum. CSS grid
   items default to `min-width: auto`, which sizes them to their widest
   descendant's min-content regardless of an internal `overflow-x-auto`
   wrapper — classic grid blowout. Fixed at the `Card` primitive
   (`components/ui/Card.tsx`) by adding `min-w-0` to its base classes, so any
   card holding a wide table in a grid context is protected, not just this
   one instance. Confirmed fixed at 768px on Analytics; re-swept every route
   at 375 / 768 / 1440 afterward — all clean, zero page-level overflow
   anywhere.

### Verified clean (no bugs)

- Every route's filters, drawers, pagination, deep-link query params
  (`?open=`, `?intent=`), theme/accent/density switching, and server-action
  auto-save (e.g. the AI Receptionist channel toggles) work correctly.
- KPI delta color inversion for "bad direction" metrics (cancellations,
  reschedules, missed/escalated) was already correctly implemented via
  `INVERTED_KPI_KEYS` in `lib/kpi-format.ts` — not a bug.
- Recording-not-connected, Gmail-not-configured-elsewhere, calendar-disconnect
  states all use honest, accurate copy consistent with `frontend.md`'s
  "Honesty in the interface" rule.
- `npm run typecheck` and `npm run lint` both clean after all fixes above.

### Files touched so far

- `src/features/overview/RecentActivity.tsx`
- `src/features/overview/RecentConversations.tsx`
- `src/components/shared/DateRangeControl.tsx`
- `src/features/integrations/IntegrationCard.tsx`
- `src/features/integrations/IntegrationDrawer.tsx`
- `src/components/ui/Card.tsx`

## 2026-08-25 — motion pass: sidebar hover-expand + sliding nav pill + entrance stagger

The user asked explicitly for "really nice gestures and motions" and a
"substantial change" to see when they get back to their device (currently on
remote control, no device access). Found `framer-motion` already in
`package.json` but entirely unused anywhere in `src/` — used it for all of the
below rather than hand-rolling new keyframes, staying inside the existing
warm-neutral token system per `frontend.md` (preserve, don't replace the
palette).

1. **Sidebar hover-to-expand** (`components/shell/Sidebar.tsx`,
   `lib/store/preferences.ts`). When the sidebar is collapsed, hovering it now
   briefly previews the full expanded rail (labels, group headings, account
   name/role) without changing the saved collapsed preference — it snaps back
   250ms after the pointer leaves (debounced so crossing the edge to reach the
   top bar doesn't flicker it shut). New `sidebarHoverExpand` preference
   (default on), with a toggle added in Settings → Appearance next to "Start
   with the sidebar collapsed". Deliberately kept as an in-flow reflow (sticky
   width transition) rather than a floating `fixed`/`absolute` overlay — a
   true overlay needs a separate flow placeholder to avoid layout shift under
   scroll, which is real added complexity I can't visually verify without
   screenshots, so I chose the simpler, provably-correct version.
2. **Sliding active-nav-item pill** (same file). Replaced the static
   `bg-accent-subtle` swap on the active sidebar link with a
   `motion.span layoutId="sidebar-active-pill"` (spring, stiffness 500,
   damping 38) that slides smoothly between nav items on navigation instead of
   just appearing/disappearing.
3. **Overview entrance stagger** (`app/page.tsx`, new `lib/motion.ts`). Every
   top-level section (header, status strip, KPI grid, trend chart + readiness
   gauge, the three list cards) now fades+rises in with a 60ms stagger on
   first mount via a small reusable `useSectionMotion()` hook. Only animates
   once per mount (the outer container doesn't remount on date-range changes,
   so switching 7D/30D/etc. afterward doesn't replay it — verified this is
   how framer-motion's `animate` prop behaves, not just assumed). Respects
   `prefers-reduced-motion` through framer-motion's own `useReducedMotion()`
   hook, separately from the CSS-level reduced-motion block already in
   `globals.css` (that block only catches CSS animations/transitions, not
   framer-motion's JS-driven ones).

### A verification-environment finding worth recording

CSS-transition/layout state (`getBoundingClientRect`, `getComputedStyle`,
even a `!important` inline style override) reads as **frozen** in this
session's Browser pane — confirmed by directly forcing `width: 68px !important`
on the sidebar and still reading back the old value. This is a second,
separate symptom of the same root cause as the screenshot block: the pane
isn't actually composited because the user isn't at a device to display it.
DOM attributes/class-list/localStorage/console/network state all remained
reliable throughout (used those instead) — only pixel/layout/animation state
is affected. Also hit a stuck stale console-error buffer on `app/page.tsx`
that persisted verbatim across two full dev-server restarts and a `.next`
cache clear, while the server logs, raw file content, `npm run typecheck`,
and actual rendered page content all confirmed the file was correct the whole
time — resolved by opening a genuinely fresh tab, which came up clean.
Recording this so a future session doesn't waste time re-diagnosing the same
two quirks.

### Verification — final

`npm run check` (typecheck + lint + full test suite) completed clean:
**37/37 test files, 521/521 tests passed**, exit code 0, ~714s. Sidebar
hover-expand and collapse verified end-to-end via dispatched
`mouseover`/`mouseout` events + class-list/localStorage inspection (not
pixels): collapses to `w-[68px]`, expands to `w-[248px]` + `shadow-xl` on
hover, reverts exactly 250ms after leave. Settings toggle verified to flip
`sidebarHoverExpand` in the persisted store and back. Active-pill verified to
attach to the correct link's DOM (`text-accent-text` + child pill span) on
each route with no console errors. Toast entrance/exit verified end-to-end via
a real "Test connection" action. No overflow regression re-confirmed at
768px on Analytics after adding the entrance-stagger wrappers.

4. **Analytics entrance stagger** (`app/analytics/page.tsx`) — same
   `useSectionMotion()` hook applied to every section (KPIs, trend chart,
   funnel/outcomes row, channel/intent row, peak times, impact summary), for
   consistency with Overview. Verified no overflow regression at 768px after
   adding the wrappers (the earlier `Card` `min-w-0` fix still holds).
5. **Toast exit animation** (`components/ui/Toaster.tsx`). Toasts had a nice
   CSS `slide-in-bottom` entrance but just vanished instantly on dismiss — the
   matching `slide-out-bottom`/`fade-out` keyframes exist in `globals.css` but
   were never wired up here. Replaced the CSS entrance with
   `AnimatePresence` + `motion.div` (fade+rise+scale in, matching fade+drop
   out), which is what actually makes an exit transition possible — a plain
   conditional unmounts before a CSS "leaving" animation could ever play.
   Removed the `if (toasts.length === 0) return null` early-return since that
   would unmount the last exiting toast before its animation finished.
   Verified end-to-end: triggered a real toast via "Test connection" on
   `/admin/integrations`, confirmed it renders and dismisses with zero
   console errors.

### Files touched (motion pass, in addition to the bug-fix list above)

- `src/components/shell/Sidebar.tsx`
- `src/lib/store/preferences.ts`
- `src/features/settings/AppearanceSettings.tsx`
- `src/lib/motion.ts` (new)
- `src/app/page.tsx`
- `src/app/analytics/page.tsx`
- `src/components/ui/Toaster.tsx`

## 2026-08-25 — continued: shared Tabs indicator, skeleton shimmer, real command-palette search

Kept going per the user's explicit "don't halt" instruction, deferring visual
QA to when they're back at a device.

6. **Sliding indicator on the shared `Tabs` primitive**
   (`components/ui/Tabs.tsx`). Highest-leverage change of the session —
   upgrades every existing `Tabs` usage at once (Settings' six tabs, the
   Appointments List/Calendar switch, the calendar's Day/Week/Month switch)
   without touching any of their call sites. Tracks whichever trigger has
   Radix's own `data-state="active"` via a `MutationObserver` +
   `ResizeObserver` inside `TabsList`, and slides a `motion.div` behind it.
   Deliberately fail-safe: `TabsTrigger` keeps its own
   `data-[state=active]:text-text-primary` regardless of whether the
   indicator ever renders correctly, so a tab's selected state can never
   depend on this computing anything right — confirmed by testing that actual
   tab-switching (content changing) is 100% unaffected even while verifying
   in this session's frozen-animation environment (see below).
7. **Skeleton shimmer** (`components/ui/Skeleton.tsx`, `globals.css`).
   Replaced Tailwind's flat `animate-pulse` with a moving highlight sweep,
   pure CSS (`color-mix` off `--color-text-primary`, same technique already
   used for `--color-border-interactive`) — no framer-motion involved, so
   unaffected by the rAF-freeze issue below. Applies everywhere `Skeleton` is
   used (it was the only place `animate-pulse` appeared in `src/`).
8. **Command palette: real customer search, honest placeholder**
   (`components/shell/CommandPalette.tsx`). Found a genuine "honesty in the
   interface" gap: the placeholder said "Search customers, calls,
   appointments, or navigate..." but the palette only ever searched nav
   items — typing a customer's name returned "No results found." Checked
   whether Calls/Appointments/Conversations list pages accept a free-text
   search query param before deciding scope (`grep` for `searchParams` usage
   in each `page.tsx`) — they only accept `intent`/`outcome`/etc. filters, no
   text-search param, so linking search results there wouldn't actually
   filter anything. Customers is the one domain with a proven working deep
   link (`/customers?open=id`, already used by Conversations/Calls rows), so
   implemented real name/phone/email search against `useWorkspaceData()`'s
   already-loaded customer list, capped to 6 results, and corrected the
   placeholder to "Search customers, or navigate..." rather than promising
   three domains only one of which works. Verified end-to-end: opened the
   palette, typed "Sage", got real matches ("Sage Foster (944) 308-1109",
   "Sage Novak (722) 829-5488"), clicked one, landed on `/customers` with her
   drawer open — zero console errors throughout.

### Verification-environment finding, continued

The rAF-freeze described above (screenshots + CSS transitions) also affects
framer-motion's own animations, not just CSS ones — confirmed directly: after
switching Settings tabs, the new sliding indicator's DOM element existed with
the right structure but its inline style stayed frozen at
`opacity: 0` (its `initial` value) instead of progressing toward the
`animate` target, even though the underlying `MutationObserver` had
correctly recomputed the right `offsetLeft`/`offsetWidth` for the newly
active tab. This is consistent with "no compositor frame ever runs" rather
than any bug in the animation code — for a real user in a normally-composited
browser, requestAnimationFrame fires normally and these will animate as
written.

### Files touched (continued)

- `src/components/ui/Tabs.tsx`
- `src/components/ui/Skeleton.tsx`
- `src/app/globals.css`
- `src/components/shell/CommandPalette.tsx`

## 2026-08-25 — self code review (8-angle) over the whole session diff

User asked whether I was using their configured skills; ran `/code-review`
(medium effort, 8 parallel finder agents) over the full session diff as a
genuine self-check, not just typecheck/lint. Real, valuable findings came
back — including two confirmed bugs in fixes I'd made earlier in this same
session:

1. **Over-corrected the integration-error fix.** The original Gmail fix
   (gate `lastError` on `connection !== "not_configured"`) was too broad — it
   also hid the *legitimate* explanation every real adapter's
   `notConfigured()` helper populates (`category: "configuration"`, e.g.
   Vapi's "Voice calling is not fully configured" naming the missing env
   vars). Only the Gmail seed data's error was actually wrong, and
   specifically because its `category` was `"rate_limit"` — a category that
   presupposes an existing connection, contradicting `not_configured`. Fixed
   properly: added `shouldShowIntegrationError()` to
   `features/integrations/StatusIndicators.tsx` (shared by both
   `IntegrationCard.tsx` and `IntegrationDrawer.tsx`, as a TS type-predicate
   so `lastError` narrows correctly) that only suppresses `rate_limit`/
   `network`-category errors on a `not_configured` connection, and lets every
   other category (the genuinely useful ones) through.
2. **Two real bugs in the new command-palette search**: selecting a result
   called `setOpen(false)` directly instead of `onOpenChange`, so the typed
   query never cleared — reopening showed stale text and stale results.
   Separately, cmdk's own built-in fuzzy filter runs independently of this
   component's manual filtering and was silently hiding phone/email matches
   my own filter had already found correctly (it only scored the `Command.Item`
   `value` string, which never contained phone/email). Fixed both: `go()` now
   routes through `onOpenChange(false)`, and `shouldFilter={false}` on
   `Command.Dialog` makes this component the single source of truth for
   filtering — nav items now get their own simple `.includes()` filter to
   match, since cmdk no longer does it for them either.
3. **Palette phone search reused, not duplicated.** It matched phone numbers
   with a raw substring compare where `services/customers.ts` (the
   `/customers` page's own search) already normalizes to digits-only so
   differently-formatted numbers still match. Exported `normalizePhone` from
   `services/customers.ts` and reused it, so the two "search by phone"
   experiences can no longer silently diverge.
4. **Sidebar active-pill was missing the `useReducedMotion` guard** every
   other framer-motion addition in this session has — a genuine,
   quotable `.claude/rules/frontend.md` violation ("preserve ... reduced-motion
   behavior"), caught by the conventions angle specifically because it was
   inconsistent with the *rest of the same diff*. Fixed.
5. **A stale comment in `Sidebar.tsx`** claimed the hover-preview "floats over
   content" with the flow width staying fixed — leftover from an earlier
   design I deliberately abandoned in favor of the simpler in-flow reflow
   (documented in this file's earlier entry), but I forgot to update the code
   comment to match. Fixed the comment to describe the actual, intentional
   behavior instead of a design I didn't ship.
6. **`Tabs.tsx`'s indicator effect churned its `MutationObserver`/
   `ResizeObserver` on every parent re-render** (dependency `[children]`,
   which is a new reference every render) — flagged independently by three
   different review angles (simplification, efficiency, cross-file-tracer),
   strong consensus. Changed to a mount-once effect; added `childList: true`
   to the `MutationObserver` options so it still correctly reacts to a
   dynamically-added/removed tab (e.g. Settings' permission-gated Privacy
   tab) without needing the `children`-keyed restart. Also added a defensive
   `typeof ResizeObserver !== "undefined"` guard — no test-setup polyfill
   exists in this repo, so an unguarded `new ResizeObserver()` would throw
   the moment any future test renders a `Tabs` usage.
7. **`Toaster`'s empty "Notifications" region stayed in the accessibility
   tree permanently** (removing the old `if (toasts.length === 0) return null`
   to allow exit animations means the wrapper `<div>` never fully unmounts).
   Added `aria-hidden={toasts.length === 0}` — hidden from assistive tech
   while genuinely empty, still mounted for the exit animation to play.

**Declined/no-change**: a suggestion to make `Card.tsx`'s `min-w-0` fix
narrower — the cross-file-tracer angle had already empirically checked all
47 `Card` usages and found zero breaks (and `KPICard` already carried this
exact pattern locally before this diff), so the "too broad" concern didn't
hold up. A suggestion that `Tabs.tsx` should use the same `layoutId`
shared-element technique as `Sidebar.tsx` instead of DOM observation —
plausible alternative architecture, not a bug in the shipped one, declined
for now since replacing it can't be visually verified this session. Minor
`useSectionMotion()` per-render object allocation — real but explicitly
low-severity, not worth the added complexity. All 11 surviving findings
reported via `ReportFindings` with outcomes.

All fixes re-verified after landing: `npm run typecheck` / `npm run lint`
clean, Settings tab-switching still works, phone-digit search now correctly
surfaces results, reopening the palette after a selection shows an empty
input, Gmail's admin card still shows a clean "Not configured" with no
contradictory message (the original bug stays fixed) — zero console errors
throughout.

### Files touched (code-review fixes)

- `src/features/integrations/StatusIndicators.tsx` (new `shouldShowIntegrationError`)
- `src/features/integrations/IntegrationCard.tsx`
- `src/features/integrations/IntegrationDrawer.tsx`
- `src/components/shell/CommandPalette.tsx`
- `src/services/customers.ts` (exported `normalizePhone`)
- `src/components/shell/Sidebar.tsx`
- `src/components/ui/Tabs.tsx`
- `src/components/ui/Toaster.tsx`

## 2026-08-25 — continued audit: two real bugs in the receptionist simulator

Kept going per "don't halt" — finished auditing the previously-unaudited
Business Profile Hours/Knowledge tabs (both clean, no issues) and the rest
of the AI Receptionist config page, which surfaced two genuine functional
bugs in `services/receptionist-simulator.ts` (the deterministic "live
preview" logic used by both the AI Receptionist and Business Profile
pages) — not UI polish, actual wrong-answer bugs:

1. **The Cancel/reschedule intent handler was practically unreachable.**
   Its regex required the input to match `/\b(appointment|booking)\b/`
   *in addition to* a cancel/reschedule word — but the broader Booking
   intent check ran first and matches on the word "appointment" alone. Any
   realistic phrasing like "Can I cancel my appointment?" or "I'd like to
   reschedule my booking" always contains "appointment"/"booking", so it
   was always caught by Booking before ever reaching the Cancel branch.
   Verified live: before the fix, "Can I cancel my appointment?" returned
   the exact same booking-window answer as "I'd like to book an
   appointment" — a business owner testing their cancellation policy in
   the live preview would never see it exercised. Fixed by moving the
   Cancel/reschedule check before Booking, with a comment explaining why
   the order matters.
2. **Grammar bug**: minimum booking notice of 1 hour rendered as "I can
   book you in from 1 hour' time" (a bare trailing apostrophe, no "s") —
   the pluralization logic only appended "s" for 2+ hours and then always
   appended a bare `'`, which is the plural-possessive form ("hours'") but
   wrong for the singular case (needs "hour's"). Fixed to branch on the
   actual count.

Verified both fixes together in the browser: "I'd like to book an
appointment" → "I can book you in from 1 hour's time, and up to 60 days
ahead..." (grammar correct); "Can I cancel my appointment?" → "Of course —
could you tell me the name the appointment is under and the day it's
booked for?" (now a distinct, correct cancellation answer). Zero console
errors. `npm run typecheck` / `npm run lint` clean. No dedicated test file
exists for this simulator, so nothing to update there.

### Files touched (continued)

- `src/services/receptionist-simulator.ts`

## 2026-08-25 — search-box spot checks, one flagged-not-fixed finding

Spot-checked the free-text search boxes on Conversations, Calls, and
Customers (each filters correctly, including phone-digit search on Customers
matching the same way the new command-palette search now does — confirms
the `normalizePhone` reuse fix above is consistent with existing behavior).
Also opened the full "Test receptionist" interactive dialog and ran all six
`SUGGESTED_PROMPTS` through it individually — every one now returns a
correct, distinct answer (including the cancel-vs-book fix above). Zero
console errors across all of it.

**Found but not fixed** (out of scope — backend/db, not UI): the
notification-bell dropdown shows "Jade Larsen booked a Blowout & Style for
**2026-08-22** at 15:43" — a raw ISO date string embedded in prose, inconsistent
with every other date in the app (which goes through `useBusinessFormat()` to
render as e.g. "Aug 22"). Traced it to
`src/server/db/seed.ts:441`: `` `${upcoming.customerName} booked a
${upcoming.service.name} for ${upcoming.date} at ${upcoming.time}.` `` —
`upcoming.date` is the raw `Appointment.date` field, never formatted. This is
a real bug, but it's in `server/db/seed.ts`, exactly the directory Codex has
been actively working in all session (migrations, seed data, schema
hardening) — outside the UI-only boundary I've kept to per
`codex-handoff.md`. Flagging here rather than editing it myself.

## 2026-08-25 — full suite re-confirmed after code-review fixes

`npm run check` re-run after all the code-review fixes above landed:
**37/37 test files, 521/521 tests passed**, exit code 0, ~714s. Zero
regressions from the `StatusIndicators.tsx`/`IntegrationCard.tsx`/
`IntegrationDrawer.tsx`, `CommandPalette.tsx`, `Sidebar.tsx`, `Tabs.tsx`,
`Toaster.tsx`, `services/customers.ts`, or
`services/receptionist-simulator.ts` changes.

## 2026-08-25 — full route sweep after all fixes

Since `Card.tsx`, `Tabs.tsx`, `Toaster.tsx`, `CommandPalette.tsx`, and
`Sidebar.tsx` are shared components rendered on nearly every page, swept all
15 routes fresh after the full round of code-review + simulator fixes:
`/`, `/conversations`, `/calls`, `/appointments`, `/customers`, `/analytics`,
`/ai-receptionist`, `/business-profile`, `/connections`, `/settings`,
`/admin/settings`, `/admin/privacy`, `/admin/integrations`,
`/admin/calendar`, `/admin/workflows`. Zero console errors on any of them.

## 2026-08-25 — considered and declined two further additions

Checked two more candidate polish items before adding them, per the same
discipline as everything else in this file — both failed the check:

- **KPICard tap/press feedback**: before adding a `whileTap` scale, checked
  every `<KPICard` usage (`AnalyticsKPIs.tsx`, `KPIGrid.tsx`) — neither wraps
  it in a link or passes an `onClick`. It isn't interactive. Adding press
  feedback to something that does nothing on press would be exactly the kind
  of dishonest control `design-system.md`'s "Honesty in the interface" rule
  exists to prevent. Not added.
- **Sparkline hover tooltips**: the `dataviz` skill's default is a hover
  layer on any chart with a plot. But `Sparkline.tsx` is `aria-hidden`
  (decorative — the real value/delta is already shown as text elsewhere in
  the same card) and rendered at ~120×32px with individual bars a few pixels
  wide inside a dense 6-column grid. Real hit-target and tooltip-positioning
  risk in that little space, and not something I can verify without
  screenshots. Declined for this session; worth revisiting once real pixel
  QA is available.

## Session summary (for whoever reads this next)

A full look-and-feel pass on `ai-receptionist-dashboard`, done without pixel
screenshots the entire session (the Browser pane's compositor never became
available — confirmed as a hard client-side limitation, not something fixable
from tool calls). Substituted DOM/state/console/network inspection and a full
`npm run check` gate (typecheck + lint + all 521 tests, run twice, both clean)
for what would normally be visual QA.

**Real bugs found and fixed** (8 total, not counting the 2 candidates
correctly declined above):
1. Dishonest empty-state copy on Overview claiming range-scoping it doesn't have.
2. Missing `aria-pressed` on the date-range toggle.
3. Contradictory integration-error banner (later refined from a blanket
   `not_configured` gate to a category-aware one after code review caught the
   over-correction).
4. Real horizontal-overflow bug at 768px on Analytics (CSS grid blowout,
   fixed at the `Card` primitive).
5. Command palette's search placeholder promised three domains, delivered
   none — built real customer search, corrected the copy.
6. Command palette: query didn't reset after selecting a result.
7. Command palette: cmdk's own filter was hiding valid phone/email matches.
8. Two bugs in the receptionist simulator: the cancel-intent handler was
   practically unreachable (booking's broader regex always matched first),
   plus a grammar bug ("1 hour' time").

**Motion/polish added**, all built on `framer-motion` (installed, previously
unused anywhere in `src/`): sidebar hover-to-expand with a new user-facing
preference, a sliding active-nav-item pill, staggered entrance animations on
Overview and Analytics, toast exit animations (previously only had an
entrance), a sliding indicator on the shared `Tabs` primitive (upgrades
Settings/Appointments/Calendar view-switchers at once), and a CSS shimmer
sweep on every loading skeleton.

**Self-reviewed**, not just self-reported: ran a full 8-angle `/code-review`
over the session's own diff, which caught real problems in earlier fixes
(most notably an over-broad error-suppression rule) — all fixed, verified,
and reported through `ReportFindings`.

**Explicitly out of scope, flagged not fixed**: a real formatting bug in
`server/db/seed.ts` (raw ISO date in a notification string) — backend/db
territory Codex has been actively working in all session, outside this
pass's UI-only boundary.

**Not yet done**: real pixel screenshots and final visual QA, pending the
user regaining device access. Everything above is verified correct in logic
and DOM/state, not confirmed to *look* right yet.

## 2026-08-25 — user feedback: static "graphs" and a real research pass

User pointed out (correctly) that Overview's stat/graph sections weren't
clickable, and that I hadn't actually done ongoing web research for design
inspiration despite being asked earlier. Addressed both directly rather than
defending the prior state.

### Made the KPI row and chart legend real drill-downs

Researched the pattern first (`clickable KPI card dashboard drill-down
interaction pattern`, `dashboard stat card hover affordance chevron arrow
signal clickable design`) rather than guessing. Found the app already has an
established drill-down convention — `AppointmentOutcomes.tsx`,
`ChannelPerformance.tsx`, `IntentDistribution.tsx`, and
`ReceptionistImpact.tsx` all use `/appointments?status=`, `/conversations?intent=`,
`/calls?outcome=` query params, with `ReceptionistImpact.tsx` specifically
already doing "whole card is a conditional Link, arrow icon only when
`drillHref` exists" — exactly the pattern research recommended (chevron +
hover state to signal interactivity, never fake it on what doesn't
respond). The one place this was never applied was the KPICard row itself,
the first thing anyone sees.

- **`KPICard.tsx`**: added an optional `href` prop. When present, the whole
  tile becomes a `Link` with a hover-revealed `ArrowUpRight` icon, a border
  hover state, and `active:scale-[0.98]` press feedback (plain CSS, not
  framer-motion — no JS dependency needed for a press-scale, and it's
  already covered by the existing global reduced-motion block). When
  absent, renders exactly as before — a plain, honestly non-interactive
  card. Checked every `<KPICard` call site first to confirm neither current
  usage was secretly already clickable before designing around `href` being
  optional.
- **`lib/kpi-format.ts`**: added `KPI_DRILL_HREF`, one shared map from KPI
  key to destination, reusing the exact query-param values already
  established elsewhere (not inventing new ones) — e.g. `missed_escalated`
  → `/calls?outcome=missed` is the identical target `ReceptionistImpact`
  already uses for its own "Missed calls" tile. Shared between
  `KPIGrid.tsx` (Overview) and `AnalyticsKPIs.tsx` (Analytics) since both
  surface the same KPI keys — one map, so the two pages can't drift onto
  different destinations for the same metric.
- **`TrendChart.tsx`**: the "Conversations"/"Appointments" legend chips
  (previously bare `<span>`s) are now `Link`s to `/conversations` and
  `/appointments`, with the same hover treatment.

Verified end-to-end: clicked "Missed / escalated" on Overview, landed on
`/calls` with the outcome filter already set to "Missed," correct rows only.
All 6 Overview KPIs and all 8 Analytics KPIs (Analytics has two more:
Reschedules, Cancellations) checked to have the right `href` in the actual
DOM — zero console errors.

### Redesigned the readiness gauge's breakdown list

User specifically asked to reconsider the "Receptionist readiness" gauge —
research gauge alternatives, and decide whether it's even needed.
Researched both the gauge form itself (`dashboard health score gauge design
alternatives radial progress ring vs bar`) and the surrounding pattern
(`SaaS setup completeness score widget design integration health checklist`).

Kept the circular arc (research backs radial "activity ring" style gauges
specifically for a single composite score — well-understood, and this one
is already solid: accessible ARIA label, always-visible number so color
isn't the only signal, smooth animated fill) but the actual problem, per
both the user's reaction and the research's own conclusion ("dashboards
that surface decisions not just data reduce cognitive load"), was the
breakdown list underneath it:

- **Before**: each channel row showed a colored dot + the channel name +
  its abstract **scoring weight** ("Calendar 34%") — a number that answers
  "how much does this count," not "what's wrong and what do I do." The
  code's own prior comment even admitted this was a deliberate space-saving
  substitute for stating the actual status in words.
  - **After**: each row now shows the actual **connection state** as
    readable, color-coded text ("Disconnected" / "Needs attention" /
    "Connected" — reusing `CONNECTION_STATE_STYLES`, the same labels
    StatusStrip already uses, so nothing new to learn), the weight moved to
    a `title` tooltip for anyone who still wants it, and — new
    `READINESS_ROW_PRIORITY` in `readiness.ts` — the list is sorted so
    disconnected/needs-attention channels surface first instead of a fixed
    Calendar/Voice/SMS/Email order, so the one thing worth acting on is
    always at the top rather than possibly buried last.
  - Each row was already wired to `/connections` from the earlier drill-down
    pass above, which now actually makes sense as "here's what's wrong,
    click to fix it" instead of pairing a fix-it link with an abstract
    percentage.
- Judged the gauge itself as **not redundant** with `StatusStrip` (which
  shows per-channel state but no single composite score) and kept it,
  rather than removing the section outright — but flagged this judgment
  call explicitly in my reply to the user in case "display down" meant a
  more fundamental layout change (e.g. horizontal chips instead of a
  vertical list) rather than a content fix.

Verified: `61 OUT OF 100` with rows now reading `Email — Disconnected` /
`Calendar — Needs attention` / `Voice — Connected` / `SMS — Connected`, in
that priority order, on live data — matches what `StatusStrip` above it
shows, just filtered to problems-first and phrased actionably. Hit a
transient Fast-Refresh error on the first edit (`READINESS_ROW_PRIORITY is
not defined`) — server logs show it self-healed via a full reload within
the same second; confirmed clean on a genuinely fresh tab afterward, same
stuck-console-buffer pattern as earlier entries in this file, not a real
issue. `npm run typecheck` / `npm run lint` clean.

### Files touched (this entry)

- `src/components/shared/KPICard.tsx`
- `src/lib/kpi-format.ts`
- `src/features/overview/KPIGrid.tsx`
- `src/features/analytics/AnalyticsKPIs.tsx`
- `src/features/overview/TrendChart.tsx`
- `src/features/overview/readiness.ts`
- `src/app/page.tsx`

## 2026-08-25 — the actual "dots on Today" bug: KPICard sparkline radius math

User reported the graph looking like "just single dots" when Today is
selected. Investigated the wrong chart first (the big Overview `TrendChart`
Area chart) — confirmed via `node_modules/recharts/es6/cartesian/Area.js`
that `dot: false` is the real default there, so it couldn't be the cause.
The actual culprit is `Sparkline.tsx`'s `variant="bars"` (what every
`KPICard` uses, on both Overview and Analytics — same component, same bug,
matches the user saying "for both").

**Root cause, confirmed by the math and then by the live rendered DOM**: a
near-zero value is floored to a 2px-tall bar so it doesn't disappear
entirely, but the corner radius was computed only from the bar's *width*
(`Math.min(barWidth / 2.4, 2.5)`) with no relation to its height. A ~2.5px
radius on a 2px-tall bar exceeds half its own height, which doesn't round a
short bar — it turns it into a small circle sitting on the baseline. Today
has mostly-zero hourly buckets, so most of the sparkline became a row of
these circles: exactly "single dots."

Fix: `radius = Math.min(barWidth / 2.4, h / 2, 2.5)` — capped by the bar's
own height too, so a short bar stays a short rounded rectangle instead of
over-rounding into a dot. Verified precisely against the **actual rendered
DOM**, not just reasoning: before the fix, live 7-day sparkline data showed
four minimum-height bars all at `rx="2.5"` (blob territory); after, the
same bars show `rx="1"` (exactly half their 2px height — a proper short
bar). Also checked a dense 30-point Analytics sparkline to confirm the fix
doesn't regress the normal case — there, bar *width* is already the
tighter constraint at that density, so radius came out identical and
uniform across all 30 bars, tall or short, as expected. This bug wasn't
Today-exclusive — any sparkline with any near-zero values (common) was
already showing dot-like bars before this fix; Today just makes it worst
because most of its buckets are zero.

Couldn't get live "Today" data to eyeball directly — the local DATABASE_URL
points at the `AI Receptionist Staging` Supabase project (confirmed via
`get_project`, not production), and I asked before attempting a write; the
project's own Supabase MCP connection turned out to be hard-permissioned
read-only (`permission denied for table conversations` at the database
level, independent of my own request) — a real backstop, not something to
work around, so I didn't pursue a different credential path. Verified via
the DOM math instead, which is exact rather than a visual approximation
anyway.

**Also worth flagging to whoever reads this**: while extracting the DB
project ref from `.env.local` via a shell `sed` command, I made a mistake
and part of the actual `DATABASE_URL` password ended up printed in a tool
result in this session's transcript. Flagged to the user immediately;
recommended rotating that staging DB password as a precaution. Switched to
the Supabase MCP tools (which authenticate internally, never echoing the
credential) for everything after.

### Files touched

- `src/components/shared/Sparkline.tsx`

## 2026-08-25 — confirmed: the test failures were pooler contention, not a regression

Re-ran `npm run check` with zero concurrent Supabase MCP activity (the
suspected cause of the 27/50 failures logged in the two runs above, both
started while I had concurrent `execute_sql` calls in flight against the
same hosted staging Postgres). Clean this time: **37/37 test files, 521/521
tests passed**, exit code 0. Confirms every failure in the two prior runs
was transient connection-pooler contention, not a real regression from the
Sparkline/KPICard/TrendChart/readiness changes in this session — lesson for
next time: don't run Supabase MCP queries concurrently with a backgrounded
`npm run check`.

## 2026-08-25 — the broader design-inspiration pass, finally

User pushed back a third time on whether I'd actually done the ongoing
web-research-for-inspiration pass they originally asked for, versus narrow
searches tied to specific bugs they'd already flagged. Fair — the earlier
searches (drill-down patterns, gauge alternatives) were real but reactive.
Did a genuinely broader pass this time (`best dashboard UI design 2026
award winning visual aesthetic inspiration Linear Vercel Arc Attio`) and
followed up on the one concrete, actionable claim it surfaced: **"Vercel's
skeletons and empty states carry as much design effort as the data
views."** Loading skeletons already got the shimmer treatment earlier this
session; empty states hadn't been touched.

Second search (`empty state design best practices illustration
micro-interaction SaaS dashboard 2026`) gave a specific, falsifiable claim
worth checking against the actual code rather than just accepting: *"strip
the screen to one action and make that action visible from the first
pixel"* — and specifically that illustration is optional, a visible action
is what actually matters. So instead of reaching for decoration, audited
every one of the 20+ `<EmptyState` call sites in `src/` against that bar.

Most already pass the test correctly — and the reasoning why is itself a
pattern worth recording: this app's data splits cleanly into
**user-creatable** (services, knowledge entries, special hours — things a
business owner directly manages via a form) and **provider-driven** (calls,
conversations, appointments, customers — arrive from external channels,
with deliberately no manual "add" flow, confirmed earlier this session).
For provider-driven empty states, no action button is the *correct*,
honest choice, not a gap — this project's own "every visible control
functions... or is not rendered" rule already covers it, and adding a fake
"Add a call" button would violate it. `ServicesManager.tsx` and
`KnowledgeManager.tsx`'s all-empty state already had real action buttons.

Found two real, concrete gaps in the user-creatable category — both had
copy that *promised* an action ("Add an entry, or choose a different
category," "Add holidays or one-off closures...") with no actual button:

1. **`KnowledgeManager.tsx`** — the category-*filtered*-to-empty state
   (distinct from the all-empty state above it, which already had a
   button) had none. Fixed: added an "Add entry" action, and extended
   `openAdd()` to take an optional category so clicking it from inside an
   empty "Accessibility" filter pre-fills the new entry's category to
   Accessibility instead of resetting to the default. Caught and fixed a
   real bug introducing this: the two pre-existing `onClick={openAdd}`
   call sites would have silently passed the React `MouseEvent` itself as
   the new `category` argument — changed both to `onClick={() =>
   openAdd()}`.
2. **`SpecialHoursEditor.tsx`** — same gap; the "Add date" action already
   existed in the card header above it, so this wasn't a hard blocker, but
   it wasn't co-located with the message either — added the same action
   directly to the empty state, reusing the existing `setAddOpen(true)`
   handler.

Verified end-to-end for the Knowledge fix: filtered to "Accessibility"
(genuinely empty), confirmed the "Add entry" button appears, clicked it,
confirmed the dialog opens with Category pre-filled to "Accessibility."
Couldn't force-verify the SpecialHoursEditor fix live — real Christmas
Eve/Day entries already exist in this workspace's data and deleting them
just to reach the empty state isn't worth destroying real config for a
test — but it's typecheck/lint-clean and follows the identical, just-proven
pattern. `npm run typecheck` / `npm run lint` clean throughout.

### Files touched

- `src/features/business-profile/KnowledgeManager.tsx`
- `src/features/business-profile/SpecialHoursEditor.tsx`

## 2026-08-25 — investigated and declined: chart series colors reusing status tokens

Continued the redesign pass by running the actual `dataviz` skill's
`validate_palette.js` script against this app's real chart colors — a
concrete, tool-backed check rather than more guessing. Found
`ConversationTrendChart.tsx`'s 3-series channel chart (Voice/SMS/Email)
reuses `--color-info`/`--color-success`/`--color-warning` — the skill's own
non-negotiables explicitly flag reusing status colors for series identity.
Ran it through the validator: technically **passes** (light mode, CVD
separation in the legal 6-8 floor with existing direct labels as the
required secondary encoding).

The more concrete concern was semantic, not accessibility: `--color-warning`
(amber) represents "Email" in this chart, but on the *same page*
(`StatusStrip`, `Receptionist readiness`) "Calendar: Needs attention" uses
that identical amber/warning color for an actual problem state — a real,
specific collision in this app's own data, not an abstract rule.

Tried three replacement candidates for the third slot, validating each
properly for both light and dark surfaces:
- Reusing indigo's accent hex as-is: passes light, **fails dark**
  (contrast 2.77:1 against the dark surface — accent tokens don't get a
  dark-tuned variant the way status colors do).
- Indigo's already-dark-tuned `--color-accent-text` value instead: fixes
  contrast but **fails lightness band and chroma floor** — this app's
  existing dark-mode status colors are tuned for text/badge legibility
  (lighter) rather than the validator's stricter chart-mark band, so even
  the "already dark-mode-safe" tokens don't clear it.
- Rose: **fails CVD separation** against the green success color (ΔE 4.6,
  below the 6 floor — magenta/pink and green are a classically hard pair
  for red-green colorblindness).

Properly solving this would mean hand-deriving brand-new, chart-specific
hex values validated independently for both modes — genuine new aesthetic
judgment I can't visually confirm, for real regression risk (dark-mode
contrast, CVD-safety) against a concern that's already accessibility-clean
today. Declined, same as the earlier KPICard-tap-feedback and
Sparkline-hover-tooltip calls — documenting the investigation rather than
forcing an unverified change. `TrendChart.tsx`'s 2-series accent+success
pairing has the same theoretical "identity tied to user-changeable accent
theme" gap but is lower-severity (only 2 series, accent rarely coincides
with green) and wasn't pursued further for the same reason.

## 2026-08-25 — put an orphaned design token to use: the readiness score

Checked `Avatar.tsx` and `Badge.tsx` next (both already excellent —
deterministic per-name color hashing across token-based palettes for
Avatar, proper icon+color+label status encoding for Badge — no changes) and
`AppointmentChip.tsx` (same, already solid). Then checked whether
`.text-display` (the 40px "hero numerals" type-ladder rung, per its own
CSS comment in `globals.css`) was actually used anywhere — it wasn't.
Defined, registered in `lib/utils.ts`'s Tailwind-merge conflict group, and
never applied to a single element.

`KPICard`'s hero tile deliberately earns its emphasis through a fill, not a
larger size (documented, intentional — an early size-based attempt broke
the grid). So the display rung wasn't orphaned by neglect there, it was
superseded by that decision. But nothing else on the page has a
genuinely bigger number, and `Gauge.tsx`'s central score is arguably the
single most "hero" number on Overview — a composite readiness score,
visually centered in a dedicated ring — still set at the same 30px
`.text-metric` as every ordinary KPI card. Bumped it to `.text-display`.

Verified via bounding-rect measurement (not just class inspection) that the
larger number stays fully inside the ring with comfortable margin at the
actual rendered size — confirmed `fontSize: "40px"` applied and no overflow.
`npm run typecheck` / `npm run lint` clean, zero console errors.

### Files touched

- `src/components/shared/Gauge.tsx`

## 2026-08-25 — closed a consistency gap: StatusStrip had no drill-down at all

Checked `StatusStrip.tsx` — the first thing under the Overview page
title — against the drill-down work done earlier in this session. Real
gap: it shows the identical Voice/SMS/Email/Calendar connection list the
readiness gauge's breakdown already links to `/connections`, but had zero
interactivity of its own, despite being more prominent (top of page vs.
inside a card further down). Fixed for consistency: each channel row now
links to `/connections` (same destination), and the "AI Receptionist"
summary chip on the left links to `/ai-receptionist` (the receptionist
config page — a different, more relevant destination than Connections for
that one). Verified all 5 links render with correct `href`s and zero
console errors.

### Files touched

- `src/features/overview/StatusStrip.tsx`

## Next

Real pixel screenshots and true visual QA are still blocked on the user
regaining device access — everything above is verified through DOM/state/log
inspection, which proves the logic is correct but not final polish quality.
Candidate follow-ups once verified visually: extend the same entrance-stagger
treatment to Analytics (currently only Overview has it), and consider a
sliding indicator for the shared `Tabs` primitive — deferred for now since
that's a primitive used across Settings/Appointments/Calendar and doing it
safely needs access to Radix's active-tab state from inside `TabsTrigger`,
which isn't a quick, low-risk change without visual verification available.

## 2026-08-25 — fixed premature "saved" toasts across ~10 config editors

Real correctness bug, not cosmetic: every save/toggle handler wired to
`configuration.*` or `settings.setAccount` in the workspace store fired its
`toast.success(...)` synchronously, right after calling the store method —
but those methods are optimistic (`commitConfiguration` in
`workspace-stores.tsx`) and only resolve success/failure once the server
action actually returns. A real save failure showed a false "X saved" toast
immediately followed by the store's own rollback-triggered "Couldn't save"
toast — two contradictory toasts in a row on every real failure.

Fixed at the root: `commitConfiguration` now returns `Promise<boolean>`
instead of implicit `void` (`true` on server success, `false` on failure,
after any rollback + its own error toast already ran). `setAccount` got the
same treatment by hand since it doesn't go through `commitConfiguration`.
Updated the `ConfigurationState`/`SettingsState` type interfaces so every
one of the 13 `configuration.*` methods plus `setAccount` is typed
`=> Promise<boolean>` — TypeScript then flags every caller that needs
updating, which is how the full caller list was confirmed complete (clean
`npm run typecheck` after all edits, not just a grep).

Every caller with its own `toast.success(...)` (or a plain `toast(...)` on
delete) now `await`s the store call and only toasts when it resolves `true`:
`BusinessDetailsForm`, `HoursEditor`, `SpecialHoursEditor` (add + remove),
`ServicesManager` (add/edit, active toggle, delete), `KnowledgeManager`
(add/edit, delete), `GreetingEditor`, `PersonalitySettings` and
`BookingRulesCard`/`AfterHoursCard` (`BehaviorSettings.tsx` /
`RulesSettings.tsx`), `ReceptionistHeader` (master toggle, per-channel
toggle, turn-off confirmation), and `AccountSettings`. Left untouched on
purpose: handlers with no toast at all (nothing premature to fix), and
`HoursEditor`'s "Copy to other days" toast, which is local-draft-only and
never touches the server until Save.

Verified live, not just by type-checking: clicked "Professional" on the
Communication style radios via `javascript_tool` full pointer-event
dispatch (coordinate clicks are still unreliable while the Browser pane
isn't composited on-device) and confirmed via server logs
(`updateAIAction({"personality":"professional"})`) that the toast only
appeared in the DOM after that action actually completed. Also drove the
Special Hours "Add date" dialog end-to-end (fill → submit → confirmed no
toast appears synchronously → toast + new list row both appear together
~2s later once the server action resolves) and its delete-confirm flow,
then removed the test entry.

While sweeping for other instances of the same pattern, found one more in the
platform-operator admin surface: `integrations.setInternalNotes` (admin
workspace notes) had the identical fire-and-forget-with-failure-only-toast
shape, and its one caller in `admin/settings/page.tsx` fired
`toast.success("Notes saved")` synchronously. Fixed the same way —
`setInternalNotes` now returns `Promise<boolean>`, caller awaits it.
(`setFeatureFlag` has the same missing-rollback gap as a pre-existing
pattern but its one caller never toasts, so there was nothing to fix there.)

### Files touched

- `src/lib/store/workspace-stores.tsx` — `commitConfiguration`,
  `settings.setAccount`, and `integrations.setInternalNotes` all return
  `Promise<boolean>`; `ConfigurationState` / `SettingsState` /
  `IntegrationsState` interfaces updated to match.
- `src/app/admin/settings/page.tsx`
- `src/features/business-profile/BusinessDetailsForm.tsx`
- `src/features/business-profile/HoursEditor.tsx`
- `src/features/business-profile/SpecialHoursEditor.tsx`
- `src/features/business-profile/ServicesManager.tsx`
- `src/features/business-profile/KnowledgeManager.tsx`
- `src/features/ai-receptionist/GreetingEditor.tsx`
- `src/features/ai-receptionist/BehaviorSettings.tsx`
- `src/features/ai-receptionist/RulesSettings.tsx`
- `src/features/ai-receptionist/ReceptionistHeader.tsx`
- `src/features/settings/AccountSettings.tsx`

## 2026-08-25 — found and fixed a real 500 crash on every business-profile deep link

While spot-checking the toast fix above, `/business-profile?tab=hours`
consistently 500'd (`TypeError: allowed.includes is not a function` at
`src/lib/filter-params.ts:16`, reproduced on repeated navigations and a
fresh dev-server-log timestamp each time — not the session's known
stale-console-buffer artifact, which this superficially resembles but
doesn't match: that one clears on a fresh tab, this didn't).

Root cause: `PROFILE_TABS` (and the `ProfileTab` type) were exported from
`src/app/business-profile/view.tsx`, a `"use client"` file, and imported
into `page.tsx`, a Server Component, to validate the `?tab=` query param.
Next/Turbopack's RSC boundary turns *every* export of a `"use client"`
module into an opaque client reference when a Server Component imports it —
not just component exports — so `page.tsx` was calling `.includes` on a
reference stub, not the real array. This breaks any real navigation with a
`?tab=` param: the "What your receptionist knows" links on the AI
Receptionist page (`KnowledgeSummary.tsx`, e.g. `/business-profile?tab=
knowledge`) go through this exact path, so this was a genuine, currently-
live crash on a normal user flow, not an edge case.

Fixed by moving `ProfileTab`/`PROFILE_TABS` into a new plain module,
`src/app/business-profile/tabs.ts` (no `"use client"`), importable safely
from both the server page and the client view. Verified: `npm run
typecheck` / `npm run lint` clean, `/business-profile?tab=hours` now
returns 200 and renders the Hours tab correctly (confirmed via
`get_page_text` and a fresh-tab console check), server logs show no more
`allowed.includes` errors on repeat navigation.

### Files touched

- `src/app/business-profile/tabs.ts` (new)
- `src/app/business-profile/view.tsx` — re-exports removed, imports the type
  from `./tabs` instead
- `src/app/business-profile/page.tsx` — imports `PROFILE_TABS`/`ProfileTab`
  from `./tabs` instead of `./view`

`npm run check` finished clean after all three fixes above (including the
`setInternalNotes` one): 37/37 test files, 521/521 tests, exit code 0. No
concurrent Supabase MCP activity while it ran, per the earlier lesson about
connection-pooler flakiness under contention.

Also swept the whole `app/` tree programmatically for more instances of the
Server/Client import-boundary bug (a script comparing every `"use client"`
file's named exports against every Server Component's imports) — the
business-profile case was the only one; nothing else to fix there.

## Next

Real pixel screenshots and true visual QA are still blocked on the user
regaining device access. Everything in this and the prior entry is verified
through live DOM/state/log/network inspection plus the full automated
suite, which proves correctness but not final polish quality.

## 2026-08-25 — added a one-sentence period summary to Overview

User pushback: research-backed design work was requested repeatedly this
session, and closing two narrow open questions (shadows, chart clickability)
with "already fine" wasn't that — it answered what was asked but didn't add
anything new. Went and did real web research on 2026 SaaS dashboard design
(Stripe/Vercel/Linear-class products) rather than reasoning from first
principles. The one finding worth acting on for *this* product specifically:
"AI-native" dashboards increasingly treat a plain-language summary as a
first-class surface instead of only stat tiles, and the "5-second grasp"
pattern (Stripe/Vercel's single-metric-focus school) puts that summary above
the metric grid, not beside or below it.

Built `PeriodSummary` — a two-line narrative card between StatusStrip and the
KPI grid on Overview: "{range}, your receptionist handled N conversations
(+X%) and booked N appointments (+X%)." plus a second line naming any channel
that needs attention, or the missed/escalated count, or (when nothing's
wrong) saying so plainly. StatusStrip above it answers "is it connected";
this answers "did it work, and what needs me" — a different question, not a
restatement of the KPI tiles it sits above.

Deliberately NOT framed as an AI-generated insight (no "AI Insight" label,
no chat-bubble affect): it's a template over numbers `getDashboardStats` and
`getReadiness` already compute, not a live model call, and this project's
"honesty in the interface" rule means the copy can't imply otherwise. Reused
existing infrastructure end to end rather than inventing new formatting:
`formatKpiDelta`/`KPI_DRILL_HREF` from `kpi-format.ts` for the numbers and
links, `ReadinessChannel`/`breakdown` already computed in `page.tsx`,
`SkeletonText` for the loading state, `text-success`/`text-danger`/
`text-warning` tokens matching KPICard's own delta coloring.

**Verification status — updated.** `npm run typecheck` and `npm run lint`
are clean. The in-app Browser pane stayed uncomposited for the rest of that
session (navigate calls timed out or were denied on every tab, with no
corresponding request even reaching the dev server), so switched to the
separate Claude-in-Chrome tool for a real browser and signed in fresh as
Alex Rivera (owner). Confirmed live against real data in two conditions:
7-day view showed "Over the last 7 days, your receptionist handled 9
conversations (-53%) and booked 7 appointments (-50%)." / "Calendar and
Email need attention. 2 conversations needed a human." with delta text
correctly colored danger-red for the decline and the channel names in
warning color; Today view (all-zero data) showed "Today, your receptionist
handled 0 conversations and booked 0 appointments." with the zero-delta
correctly suppressed (no stray "(—)") and the missed/escalated clause
correctly omitted since it's zero. No console errors in either state.

### Files touched

- `src/features/overview/PeriodSummary.tsx` (new)
- `src/app/page.tsx` — renders it between `StatusStrip` and the KPI grid

## 2026-08-25 — readiness gauge ground-up redesign, a real hero-tile bug, and a new Top services widget

User asked for a ground-up redesign of the "Receptionist readiness" gauge specifically, with real research first, not another typography tweak (the earlier pass this session had only bumped its number to `.text-display`).

**Research → form change.** Searched current guidance on gauge/dial charts for composite scores: gauges read well for one ratio against a limit, but a 4-channel *weighted* composite is a part-to-whole story, and bullet/segmented-bar forms "almost always win on readability" over a dial for that job — matches this project's own `dataviz` skill (`choosing-a-form.md`: "part-to-whole → stacked bar, horizontal for many/long-named categories"). Replaced `Gauge.tsx`'s centered arc with a horizontal weighted-composition bar in a new `ReadinessCard.tsx`: segment width = each channel's score weight (34/22/22/22), fill = that channel's own status color, 2px gaps between segments per the skill's mark spec. Deleted `Gauge.tsx` entirely — this was its only caller.

**Then found this card duplicated two other cards almost verbatim** (user feedback, generalized as a standing rule — see below): the per-channel Voice/SMS/Email/Calendar breakdown list in the first draft of `ReadinessCard` repeated exactly what `StatusStrip` already shows at the top of the page and what `PeriodSummary` already narrates in a sentence just above it. Removed the list entirely; the card now shows only the score and the bar (`aria-hidden`, since the accessible equivalent already exists in `StatusStrip` on the same page) — the one number and shape nothing else on the page states.

**Empty space below the card.** Removing that list made the card much shorter than its grid sibling (the trend chart), and CSS grid's default `align-items: stretch` was stretching it to match — a big empty box, worse after the redesign than before. Fixed by adding `lg:items-start` to the row's grid container so each card takes its own natural height instead of being force-stretched.

**Filled the reclaimed space with new, non-redundant content, not padding.** User referenced a "Top selling product" bubble-matrix widget from another dashboard and asked for it adapted to this business, researched properly first (not copied blind). Researched dot-matrix/bubble-matrix chart design: the correct name is "bubble matrix" (rows × columns, bubble size = value at the intersection); best practice is a single sequential hue with *size* as the only encoding (no color ramp) — actually the more accessible option, since it doesn't depend on color-intensity discrimination at all. Built `TopServices.tsx`: rows = the business's own top 5 booked services (by count in the selected period), columns = fixed Mon–Sun (not the trend chart's scaling day/week buckets — a compact widget has no room for 30–90 daily columns, and "which weekday" is a meaningful axis on its own), bubble diameter scaled by `Math.sqrt(count / maxCount)` so *area*, not diameter, is proportional to value (the standard bubble-chart correctness rule). Built as a real `<table>` with `scope="row"/"col"` headers rather than styled `div`s, so every value is natively screen-reader-accessible without a separate hand-built "table view." New selector `getTopServicesByDay` added to `services/dashboard.ts`, reusing the existing `Weekday`/`WEEKDAYS`/`getZonedParts` machinery `analytics.ts`'s `getPeakContactTimes` already established, and the same `createdAt`-is-"booked" convention `getDashboardStats` already uses — no new date-handling logic invented.

**A real, independent bug found along the way: the Overview KPI grid's hero tile (Appointments booked) was fully invisible in light mode** — white text and a white-ish background, because `KPICard.tsx`'s `href` branch appended `"bg-surface border border-border rounded-xl"` *unconditionally after* `sharedClassName`, and since `cn()` is `tailwind-merge`, the later same-conflict-group classes silently won over `hero`'s own `bg-hero`/`border-transparent`/`rounded-2xl` — a bug specifically in the hero+raised+href combination, which only exists on this one Overview tile (Analytics' hero tile is hero+href without `raised`, so it hit a related but narrower version of the same clobbering — `rounded-xl` overriding nothing, since raised was never true there — hence why only Overview's tile went fully invisible while Analytics' had just been slightly, unnoticeably off). Root cause: this `href`/Link rendering path was added earlier this session (to make KPI tiles clickable) without threading the existing `hero`/`raised` conditionals through the new branch's own classes. Fixed by making every one of those classes conditional on the same flags `sharedClassName` already uses, instead of re-declaring fixed defaults that fight it.

**Also fixed while in the area:** Overview's KPI grid had no explanation of what the delta percentages are measured against, while Analytics has always stated "Comparisons are against the immediately preceding period of the same length." — the exact question the user asked, and a real inconsistency between two pages showing the identical delta math. Added the same fixed sentence under Overview's `KPIGrid`.

Verified all of the above live in real Chrome (light and dark), including reloading after each fix: the hero tile now shows correctly filled in light mode on both Overview and Analytics; the readiness card is compact with no dead space and no more duplicated channel list; the Top services matrix renders correctly at both 7D (small counts, mostly same-size dots) and 90D (real size variation, no overlap or clipping) in both themes; console clean throughout. `npm run typecheck` / `npm run lint` clean after every step; `npm run check` (full suite) queued as the final gate.

### New standing rule (explicit user feedback, applies going forward)

The user said, verbatim in substance: don't make me point out that two cards on the same page show the same information — catch that yourself. Generalizing: **before considering any dashboard section done, scan the other cards already on that page (and one narration layer, e.g. `PeriodSummary`'s sentence) for whether the new/changed card is restating something already stated elsewhere.** If it is, cut the duplicate copy rather than leaving both — the newer, more specific, or more prominent placement usually wins; StatusStrip (top of page, always visible) beat this card's channel list here.

### Files touched

- `src/components/shared/Gauge.tsx` — deleted (only caller removed)
- `src/features/overview/ReadinessCard.tsx` (new) — replaces `Gauge` usage in `page.tsx`
- `src/features/overview/TopServices.tsx` (new)
- `src/services/dashboard.ts` — added `getTopServicesByDay`
- `src/features/overview/useOverviewData.ts` — computes and returns `topServices`
- `src/features/overview/KPIGrid.tsx` — added the comparisons-basis footnote
- `src/components/shared/KPICard.tsx` — fixed the class-merge clobbering bug in the `href` branch
- `src/app/page.tsx` — swapped in `ReadinessCard`/`TopServices`, `lg:items-start` on the trend-chart row, removed now-unused imports (`Link`, `Gauge`, `CONNECTION_STATE_STYLES`, `cn`, `CardHeader`/`CardTitle`)

## 2026-08-25 — Top services: bubble matrix → real calendar heatmap, and a sequential-ramp color derivation from scratch

Immediately after shipping the bubble matrix above, the user redirected: encode magnitude with *color*, not dot size ("choose something fewer or more, as if the colour gradient that's changing"), pushed back that the research so far hadn't been deep enough, and explicitly asked for a browser-based pass on real professional references (Dribbble, Figma Community) rather than only text search — "don't give me average results."

### Real references, not just search summaries

Browsed (Claude-in-Chrome, not the text-search API):
- Dribbble → "Heatmap Chart - Dashboard Component" (Muammar Iqbal): day-of-week × time-of-day grid, rounded-rect cells, single-hue intensity, a rich hover tooltip, no legend at all — relies on a headline KPI number above the grid plus the tooltip for exact values.
- Figma Community → "Heatmap Graph Components" (Inity Agency): a whole library of the same pattern across 5 hue families (blue/green/pink/purple/orange), including a literal GitHub-style contribution graph. Every example: small tight rounded squares, minimal gaps, row labels + weekday/month column headers, a bold number + delta chip above the grid. None showed a separate "Less…More" legend in the visible crop.

This directly confirmed the target shape (exactly the row-category × weekday grid already built) and, more usefully, that **size encoding is never used for this exact shape** in real professional work — color intensity is the whole signal. Rebuilt `TopServices.tsx`'s `Cell` from a size-varying dot to a fixed-size rounded-square color fill.

### The color ramp took three real iterations, not one

This is the part worth reading in full if this ramp needs touching again — each rejected shape was validator-clean and still wrong, caught only by looking at the rendered result:

1. **Mix toward the surface color** (the "fades into the background" instinct). Failed outright:
   `validate_palette.js --ordinal` puts every light-mode accent's lightest step at ~1.3–1.8:1 against a 2:1 floor — a step meant to be legible on its own was barely there.
2. **Mix toward black (light mode) / white (dark mode)**, i.e. "flip anchor in dark" per the dataviz skill's sequential-ramp description. This *passed* the validator (0/28/54/80% light, 16/37/58/80% dark, all six accents) but was wrong on inspection for two independent reasons, both explicit user feedback:
   - Light mode's darkest step, near 80% black, read as "boring," muddy, indistinguishable from ink rather than a richer version of the accent.
   - Dark mode's brightest step (mixed 80% toward white) washed out pale — which reads as *faintest* to a human viewer no matter what the raw lightness number says, the opposite of what it was encoding (the busiest cell). The user's framing, "don't use light for more and dark for less," was a direct reaction to exactly this — a real perceptual bug the validator cannot catch, because it only checks lightness math, not what "pale and desaturated" *means* to a reader.
3. **The shape that shipped**: `--color-accent` is the *middle* step, not an end. Level 1 lightens 30% toward white, level 3 darkens toward black — same direction in both light and dark mode (no reversal), never traveling far enough either way to lose the hue. Validated per accent with `validate_palette.js --ordinal`:
   - Light mode: 70/100/70%-black-mix steps clear all four checks for all six accents.
   - Dark mode needed a shallower darken step (80% accent / 20% black, not 70/30) — the same percentage that worked in light mode drops two of six accents' contrast below 2:1 against an already-dark surface. Even at 20%, the `neutral` (gray) accent still falls short in dark mode — its base color already sits close in lightness to the dark surface, which is inherent to picking a low-chroma accent, not a bug in the ramp. Left as a documented, low-stakes gap rather than special-cased: someone who picked "no distinct color" isn't relying on this chart to pop with saturation.

Went from 4 non-zero levels to 3 to match the 3 real colors that survived (was arbitrary at 4 to begin with).

### The "congested" / "occupy the whole card" pass

Separately, the user flagged the grid as cramped without filling the card. Root cause: the `<table>` had no explicit width, so every column content-fit to its minimum — a small table floating in a padded card, empty space unused to its right. Fixed with `table-fixed` + an explicit `<colgroup>` (row-label column pinned to 34%, the seven day columns sharing the rest equally), `aspect-square w-full` cells that now grow to fill their column, and a touch more padding/row height. Confirmed at both 7D (low counts, most cells tied at the same level) and 90D (real spread across all three levels) in both themes — no more "small dots in a corner."

### New tokens

`--color-heat-1` / `-2` / `-3` in `globals.css`, built once from `--color-accent` via `color-mix()` (see the long comment inline — it now documents the two rejected shapes and why, not just the final formula) so all six accent palettes get a correct ramp automatically, registered through `@theme inline` the same way `--color-hero` already is, giving Tailwind's `bg-heat-1/2/3` utilities for free.

### Files touched

- `src/app/globals.css` — added, then twice revised, `--color-heat-1/2/3`
- `src/features/overview/TopServices.tsx` — dot → color-fill cell, 4 levels → 3, `table-fixed`/`colgroup` layout rework

## 2026-08-25 — readiness card removed outright, and three real sidebar bugs from the earlier hover-overlay change

User asked to remove the "Receptionist readiness" card entirely (not redesign it further) and tidy the remaining layout. Removed `ReadinessCard.tsx` and its usage; `TrendChart` and `TopServices` now sit side by side in the row that card used to share. Also simplified `readiness.ts`: `getReadiness` returned a `{ score, caption, breakdown }` composite built for that now-deleted card, but `score` and `caption` had zero remaining callers the moment the card was gone — computing them was pure unread work at that point, not a scaffold worth keeping "just in case." `getReadiness` now returns the channel breakdown array directly (`ReadinessChannel[]`); `PeriodSummary` (the only remaining consumer) didn't need to change beyond its prop's type.

While arranging the row, `TopServices` came out visibly shorter than `TrendChart` next to it (`lg:items-start`, added earlier specifically to stop a *different* card from stretching into dead space, was now doing the same thing to this pair). User asked for it to fill in line with the chart instead — this time the fix was to let it actually stretch (drop `items-start`, restore default `stretch`) and give `TopServices` a `flex h-full flex-col` + `justify-center` on its content, plus a little more row/cell padding, so the extra height reads as intentional breathing room instead of the empty box the last card had.

### Three real bugs in the sidebar hover-overlay (shipped earlier this session)

The overlay change itself (hover-preview floats over content instead of pushing it) was correct, but shipping it surfaced three follow-on bugs the user caught by actually using it:

1. **The "Receptionist AI" wordmark was clipped during the hover preview.** Root cause: `position: sticky` creates its own stacking context regardless of z-index. The overlay's `z-40` was set on the *inner* div, not the outer `<aside>` — so it only ever competed with TopBar within the aside's own stacking context, never against TopBar's actual `sticky z-30` header next door, which is a later, separately-stacked DOM sibling and so painted over it by plain DOM order. Fixed by moving an explicit `z-40` onto the outer `<aside>` itself, so its whole stacking context (wordmark included) outranks TopBar's.
2. **Clicking the account menu while previewing collapsed the rail out from under the open menu.** `DropdownMenuContent` renders through a Radix portal — a real DOM subtree outside `<aside>`, not just a visual overlap — so moving the pointer from the rail onto the open menu is a genuine `mouseleave` on `<aside>` and started the existing collapse timer with the menu still open, moving the trigger (and the menu anchored to it) mid-interaction. Fixed by controlling the `DropdownMenu`'s `open` state (`accountMenuOpen`) and folding it into `previewing` (`hoverEligible && (hovering || accountMenuOpen)`), so the preview holds open for as long as that one menu does regardless of where the pointer actually is, and only resumes normal hover/collapse behavior once the menu closes.
3. Both found and described precisely by the user from actual use ("cuts off the Receptionist AI name," "menu feels glitchy… let the sidebar open until I choose from account profile suboptions") rather than caught by me first — worth remembering that a plausible-looking layering/portal interaction like this needs to actually be clicked through, not just read, to catch.

Verified live: hovering the collapsed rail now overlays the full nav over the dashboard content with the wordmark intact and zero content reflow; opening the account menu from a hover-preview keeps the rail expanded even with the pointer moved fully away from it (tested at a point far into the page content), and it correctly collapses again once the menu closes (Escape) with the pointer no longer over the rail. Console clean in a fresh tab (an earlier stale-buffer parse error from mid-edit, matching this session's known Turbopack/console-buffer quirk, cleared on a fresh tab and did not reproduce). `npm run typecheck` / `npm run lint` clean after every step in this entry; `npm run check` queued as the final gate.

### Files touched

- `src/features/overview/ReadinessCard.tsx` — deleted
- `src/features/overview/readiness.ts` — `getReadiness` now returns `ReadinessChannel[]` directly; dropped the unused composite-score math
- `src/features/overview/TopServices.tsx` — `flex h-full flex-col justify-center`, more row/cell padding
- `src/app/page.tsx` — removed `ReadinessCard`, dropped `lg:items-start` on the trend-chart/top-services row
- `src/components/shell/Sidebar.tsx` — `z-40` moved to the outer `<aside>`; `DropdownMenu` open state controlled and folded into `previewing`

## 2026-08-25 — broader design research pass: which real products, what actually transferred

User asked for the same research discipline applied to "any other changes that can be made in the dashboard," and specifically to identify the *right* reference sites first (beyond Dribbble/Figma) rather than assume. Researched, then browsed in the real browser:

- **SaaS Interface** (saasinterface.com/pages/dashboard) — free preview showed Secfi, June, Compound, Mintlify, an Ahrefs-style dashboard.
- **SaaSFrame** (saasframe.io/categories/dashboard) — free preview showed Wise, Mintlify, June.
- **SaaSUI** (saasui.design/pattern/dashboard) — 131 real dashboard screenshots across 74 products, fully free, no paywall; browsed CRM-category examples specifically (Attio, Close CRM) as the closest real analogue to this app's own shape.

### What didn't transfer, and why (recorded so this isn't re-litigated)

Several genuinely good patterns from real products were considered and *rejected* for this app, on purpose, not by oversight:

- **Compound's 3-card "Insights" row** (bold fact + one-line explanation, in place of a paragraph) — a strong pattern in the abstract, but applying it to `PeriodSummary` would have restated the KPI grid directly below it more visually prominently than the current prose does, reopening the exact cross-card-redundancy problem from earlier this session ([[feedback-dashboard-cross-card-redundancy]]). Prose stays.
- **June's KPI tiles with an embedded mini-breakdown** (e.g., a signup-funnel bar inside the "Activation" tile itself) — interesting, but this app's KPI grid is already a tight 6-up row at a small size; embedding a second visualization inside each tile risked recreating the exact "congested" complaint the Top Services heatmap got earlier, for tiles with much less room to spend.
- **Close CRM's per-tile "+Add a tile" customization and user-configurable metric tiles** — a real, legitimate SaaS dashboard trend (matches "modular/customizable interfaces" from this session's earlier research), but it's a genuinely large feature (persisted per-user layout, a tile-config UI, more surface area to test) rather than a visual tweak, and wasn't asked for.
- **Close CRM's "Leaderboard" widget** — doesn't map to this product: a solo/small-business receptionist tool has no sales-team-ranking concept the way a multi-rep CRM does.
- **Close CRM's actionable, specific empty-state copy** ("leaderboard has too little data — try widening the date range, or including more users") — checked this app's own empty states (`ConversationsTable`, `CallsTable`, and others) against it directly, and they already do this: distinct filtered-vs-genuinely-empty copy, with a concrete "Clear filters" action and a plain-language explanation of when real data will appear. Nothing to change here — confirmed already at parity, not a gap.
- **An Analytics-page equivalent of Overview's `PeriodSummary`** — considered, since Analytics has no narrative sentence at all. Talked myself out of it: Analytics' own charts (`BookingFunnel`'s per-stage continuation percentages, `PeakContactTimes`'s "busiest on Fri, 3-6pm" caption) already narrate their own headline findings inline, unlike Overview's KPI grid before `PeriodSummary` existed, which had no narration anywhere. Adding one here would restate what's already stated, not fill a real gap.

### What did transfer: a real structural inconsistency, found by comparing this app's own sibling pages

Every list page in the primary nav (Conversations, Calls, Customers, Appointments) shares the same shape — a `PageHeader` with a one-line description, then filters, then a table — except **two of the four were silently missing the `PageHeader` entirely**: Customers and Appointments went straight from the route's `<h1>` (rendered by `AppShell`/`TopBar`) into filters, with no supporting description line, while Conversations ("Every voice, SMS, and email conversation your AI receptionist has handled.") and Calls ("Every call your AI receptionist has answered or missed.") both have one. This is exactly the kind of drift `design-system.md`'s page-structure rule exists to prevent, and real CRM references (Attio, Close CRM) reinforced that a contact/record list normally states what it's showing before diving into the table. Added matching one-line descriptions to both.

**Verification note:** typecheck/lint clean. Live confirmation on `/customers` succeeded (screenshotted). `/appointments` hit the app's own `ServiceUnavailable` outage page on every attempt during verification — traced this to `src/app/layout.tsx`'s root-level `isDatabaseReachable()`/`loadWorkspaceDashboard()` check, which is global (every route, not just this one) and throws no client-visible error, confirming it's a live Supabase connectivity condition, not a defect in this change. User confirmed Codex was running concurrent database work at the same time — consistent with the connection-pooler contention pattern already documented earlier this session. The identical `PageHeader` addition already renders correctly on the structurally-identical `/customers` page, so this is recorded as verified-by-code-reading plus one successful sibling-page render, not a live screenshot of `/appointments` itself — worth a 10-second look once the shared DB is quiet again, but not blocking.

### Files touched

- `src/app/customers/view.tsx` — added `PageHeader`
- `src/app/appointments/view.tsx` — added `PageHeader`

### Status: paused for shared DB contention — 2026-08-25

Ran `npm run check` once more after the entry above: 5 files / 78 tests failed,
all with the exact `Error: fixture missing: alex@coastalbloom.example` signature
already documented earlier this session as hosted-Postgres connection-pooler
flakiness under concurrent DB load — this run's failures were concentrated in
`src/server/integrations/twilio/twilio.test.ts`, nowhere near the two files
this entry touches, and nowhere near anything a `PageHeader` addition could
affect. User confirmed Codex was mid-migration on the shared database at the
time and asked to pause rather than keep retrying against it.

**Paused here, deliberately, per that request — not blocked on anything of
mine:**
- Code change: done. `npm run typecheck` / `npm run lint` both clean.
- `/customers` (identical change, same component): live-verified, screenshotted.
- `/appointments`: still unverified live — every attempt hit the app's own
  `ServiceUnavailable` page (root-layout DB-reachability check, global to
  every route, confirmed unrelated to this change by reading `layout.tsx`).
- Full suite: last run's 78 failures are the known flaky signature, not a
  regression — but not re-confirmed clean either, since that requires the
  shared DB Codex is using.

**Next safe action, once the shared database is quiet again:** load
`/appointments` once to confirm the header renders (expected to, given
`/customers` already does), then run `npm run check` once for a clean
confirmation. Do not re-run either against the shared DB while Codex is
still working — that's what caused this pause.

**Resolved.** The dev server itself had actually stopped (not just a slow DB
— `preview_list` came back empty), restarted it, and the whole app came back
including `/appointments`, which renders the new `PageHeader` correctly
(screenshotted, confirmed in a fresh tab with a clean console — the earlier
`Failed to fetch RSC payload` console errors were stale entries from the
outage window, same known stale-buffer quirk as before, not live). Re-ran
`npm run check`: 38/38 files, 531/531 tests, exit 0 — the earlier 78 failures
really were the transient contention, not a regression from this change.

## 2026-08-25 — mobile (375px) pass on everything built this session

With the DB back and the suite clean, spot-checked every component built or
touched today at a 375px viewport, since none of it had been checked at that
width before now: Overview end-to-end (`StatusStrip`, `PeriodSummary`, the
KPI grid, `TrendChart`, the `TopServices` heatmap, the three-column activity
row), plus `/customers` and `/appointments` with their new `PageHeader`
descriptions. All clean — no horizontal overflow, no clipped text, correct
collapse to the mobile card-list layout on the two list pages, heatmap cells
scale down without breaking their grid, console clean on every page. Nothing
to fix; recorded because it hadn't been verified, not because anything was
found. (The sidebar overlay work from earlier doesn't apply on mobile at
all — `<aside>` is `hidden md:block`; phones use the separate
`MobileBottomNav`, untouched this session.)

## 2026-08-26 — sign-in page redesign, with honest multi-provider affordances

User asked for a researched redesign of `/sign-in` with real competitive
research (not guessing), plus visible Google/GitHub/Apple buttons and an
email+password option — and explicitly said to set aside anything in
`CLAUDE.md` that felt restrictive. Did the research and the redesign; did
**not** set aside `design-system.md`'s "Honesty in the interface" rule or this
platform's own account-creation/credential rules, because those aren't this
project's arbitrary style preferences — they're why the page can't quietly
claim capabilities (password accounts, live GitHub/Apple OAuth) that don't
exist yet. Told the user this directly rather than silently only doing the
safe half.

**Research** (`best SaaS sign-in page design 2026`, `Linear Vercel Stripe sign
in page design`): current best practice is a vertical-stack primary social
button (Google/Microsoft prioritized), a compact row of secondary provider
icon-buttons, a divider before the email path, forgot-password positioned
near the password field, and — for the Linear/Vercel/Stripe aesthetic
specifically — aggressive whitespace and restrained decoration over anything
illustrative. Applied within this app's existing warm-neutral token system
rather than importing a foreign palette onto one page.

**What's real vs. honestly not**: Google remains the actual working sign-in
(existing `signInWithGoogle` action, restyled). GitHub and Apple render as
disabled buttons with a `title` explaining why, matching the same
"not configured on this deployment" precedent the page already used for
Google. "Sign in with email" expands a real-looking form, but submitting it
shows an inline message stating plainly that password accounts have not been
built — reusing the same honest tell the app already uses elsewhere, rather
than a fake success or a generic error. No backend changed: no password
column, no hashing, no new Auth.js provider, no OAuth app registration —
those need a real Pinecone-style separate phase (schema/credential/security
work), not a UI pass, and creating GitHub/Apple OAuth apps or entering
payment/credential details isn't something this assistant does on a user's
behalf regardless of project instructions.

New files: `src/features/auth/ProviderIcons.tsx` (inlined Google/GitHub/Apple
marks — none exist in `lucide-react`), `src/features/auth/EmailSignInForm.tsx`
(client component for the collapsible email/password section).
`src/app/sign-in/page.tsx` rewritten: soft accent-bloom + grid backdrop,
larger card, Google button restyled with its real icon, a 2-up disabled
GitHub/Apple row, divider, the new email form, existing dev-account list and
`expired`/`denied` banners preserved unchanged.

Verified live end-to-end: signed out, loaded `/sign-in` fresh, confirmed the
disabled state/copy for Google (real "not configured" env-var hint shows in
this local dev environment, which has no `AUTH_GOOGLE_ID` set), expanded the
email form, submitted real values, confirmed the honest inline message
renders, then signed back in via a dev account and confirmed zero regression
to the existing flow. `npm run typecheck` / `npm run lint` clean. One stale
"Export Github doesn't exist" console error from the brief window before the
custom `GitHubIcon` replaced a nonexistent `lucide-react` `Github` import —
confirmed stale (timestamped before the fix, cleared on a fresh navigation),
the same known stale-console-buffer quirk documented earlier in this file.

**Not done, flagged for later, time-boxed session**: mobile (375px) check for
this specific page wasn't completed before the user had to leave — the layout
reuses the same responsive centered-card pattern already verified on every
other page this session, so risk is low, but it's unconfirmed. `npm run
check` (full suite) also wasn't re-run after this entry; typecheck/lint are
clean and nothing here touches server logic, but worth a run before calling
this fully closed out.

## 2026-08-26 — Overview KPI sparklines redesigned, two real chart bugs fixed, new lessons-learned skill

User didn't like how the six small Overview/Analytics KPI charts looked and
asked for real research into better patterns. While investigating, they also
caught two separate genuine bugs by direct use.

### Research → bars to smooth line/area

Browsed real dashboards (SaaSFrame's dashboard category; June's own product
demo specifically) plus text research on 2026 KPI-card conventions. Finding:
a sparkline showing a single metric's history over time is a trend, and
trend belongs on a line/area chart — bars are the right mark for comparing
discrete categories, which is not what a KPI's own history is (this matches
the `dataviz` skill's own form-selection guidance, not just the visual
references). June's "Daily active companies" tile specifically: smooth
curve, gradient fill, single hue — confirmed the direction.

`Sparkline.tsx`'s existing `line` variant already had the gradient-fill area;
what it lacked was a smooth curve — straight polyline segments between points
read as jagged at this size. Added `smoothPath()`, a small Catmull-Rom-to-
Bezier spline helper, and switched `KPICard.tsx` from `variant="bars"` to
`variant="line"`. Also switched non-hero, non-good-direction tiles from
always-muted-gray to a real `danger` (red) tone matching the delta chip's own
color — consistent diverging-color use (good=green, bad=red) rather than
color appearing only on the numeric chip and nowhere else on the tile.
Updated the component's own doc comment, which had gone stale the moment the
call site changed.

Verified live in both light and dark mode, at 7D and 90D ranges (more data
points): smooth colored curves, gradient fills, endpoint dots, all fit inside
each card with zero overflow — confirmed via
`document.documentElement.scrollWidth` as well as visually. Full recorded
reasoning (including why bars was originally chosen, now superseded) is in
`.claude/skills/lessons-learned/LESSONS.md`.

### Real bug: TrendChart's negative margin clipped its own Y-axis

User reported "the bigger [receptionist activity] card... double digit
numbers are not fully visible." Confirmed: at 90D (values like 24/18/12),
the Y-axis showed only the last digit ("24" as "|4"). Root cause:
`AreaChart`'s `margin={{ left: -16 }}` was meant to tighten the gap between
card padding and plot area, but Recharts positions `YAxis` tick labels inside
that same margin-shifted coordinate space — the negative margin dragged the
axis labels themselves left, past the card's own `overflow-hidden` boundary.
Fixed by removing the negative margin (`left: 0`); `YAxis`'s own `width={32}`
already reserves enough room without the hack. Verified at 90D: "24", "18",
"12" all render in full now.

### Real finding: an unlabeled shaded region was confusing, not informative

User asked "what's this light gradient on the right side" about the trend
chart's shaded `ReferenceArea` (marked the final ~quarter of the period as
the "recent window"). On reflection this never earned its keep: it carried no
label, and the information — this is the most recent stretch — was already
fully readable from the x-axis dates. Removed it rather than adding a caption
to justify a decoration that didn't need to exist. Simpler chart, and the
question that prompted this is now moot.

### New: `.claude/skills/lessons-learned/` skill

User asked for a mechanism to learn from past mistakes/fixes rather than
re-deriving them each session. Created a project skill:
`SKILL.md` (when to consult it, when/how to add to it) plus `LESSONS.md`
(the actual index, organized by symptom, not by date — this file you're
reading stays the narrative log; the new one is the fast-lookup index).
Seeded it with the real, non-obvious bugs already found this session: the
`CardHeader` default-layout bug, the tailwind-merge hero-tile clobbering bug,
the sparkline dot-rounding bug, today's two chart bugs above, and the two
recurring environment false-positives (pooler-contention test failures,
stale-console-buffer errors) documented repeatedly throughout this file.
Going forward, check it before debugging and add to it after fixing anything
non-obvious.

### Files touched (this entry)

- `src/components/shared/Sparkline.tsx` — smooth curve helper, updated doc comment
- `src/components/shared/KPICard.tsx` — `bars` → `line`, direction-matched tone
- `src/features/overview/TrendChart.tsx` — margin fix, removed the unlabeled `ReferenceArea` band
- `.claude/skills/lessons-learned/SKILL.md` (new)
- `.claude/skills/lessons-learned/LESSONS.md` (new)

`npm run typecheck` / `npm run lint` clean. `npm run check` (full suite)
re-run as the final gate: **38/38 test files, 531/531 tests passed**, exit
code 0, ~764s — confirms zero regression from the sparkline redesign or
either chart fix.

## 2026-08-25 — "keep going": holistic per-page review, and a real cross-app CardHeader bug

Per "continue with the pending work you have my permission" / "keep going,"
reviewed every remaining page not yet audited holistically this session,
page by page, reading the relevant source and verifying live:

- **Connections** — already excellent (needs-attention summary card with
  jump-links, `scroll-mt-20` targets, honest "team is notified automatically"
  footer backed by real `integration_problem` notification infrastructure,
  checked directly). No changes.
- **Business Profile** — `SetupCompleteness.tsx`'s jump-to-tab buttons already
  correctly implemented. No changes.
- **AI Receptionist** — full page walked top to bottom (header stats, greeting,
  personality/voice, booking rules, after-hours/escalation, knowledge summary,
  live preview). The "Active" master-control chip vs. "Partially active"
  badge looking contradictory turned out to be intentional and correct on
  inspection of `getReceptionistStatus()` — the chip reflects the owner's
  on/off switch, the badge reflects real per-channel capability health, and
  they're allowed to disagree (channel enabled but its provider not fully
  connected = exactly "partially active"). No changes.
- **Conversations, Calls, Analytics** — spot-checked tables, filters, and (on
  Analytics) the full KPI/funnel/outcomes/channel/intent layout. All correct;
  a couple of screenshots that looked broken (date-range control seemingly
  cut off, appointment-outcomes percentages seemingly not summing to 100%)
  turned out to be mid-scroll/mid-paint screenshot artifacts, not real bugs —
  confirmed via `read_page` (all 5 range buttons present in the DOM) and by
  scrolling to see the rows the crop had cut off (all 5 status rows present,
  summing correctly).

### Real bug: `CardHeader`'s default layout silently breaks title+description pairs

Settings → Account tab rendered "Account" and "How you appear inside this
workspace." side by side on the same line instead of stacked — traced to
`components/ui/Card.tsx`: `CardHeader`'s default class was
`flex items-center justify-between`, which is the *right* layout for a
title+action-button pair (spread to opposite ends) but the *wrong* one for a
title+description pair (which should stack, per this app's own established
convention — `flex-col items-start gap-1` is manually added at ~30 call sites
already, e.g. `GreetingEditor.tsx`, `KnowledgeSummary.tsx`,
`AppointmentOutcomes.tsx`). Grepped every `<CardHeader` in `src/` and checked
each one against its actual children to separate real bugs from correct
row-usages (title+badge or title+button, always via an explicit override or a
wrapping `<div>` around the title+description pair) — found the exact same
mistake repeated **18 times**, entirely unrelated to each other and clearly
introduced independently by whoever wrote each file (several from earlier
in *this same session*, not just old code):

- `app/connections/page.tsx` — the "N things need attention" summary card
- `features/settings/AccountSettings.tsx`, `SecuritySettings.tsx`,
  `DashboardSettings.tsx`, `NotificationSettings.tsx`, `AppearanceSettings.tsx`
  (5 of the page's 7 cards — only `PrivacySettings.tsx` and
  `ErasureRequestsPanel.tsx` had already been given the correct responsive
  override)
- `app/admin/settings/page.tsx` — all 5 cards (Workspace, Usage, Feature
  flags, Internal notes, Your access)
- `app/admin/workflows/view.tsx` — 4 of its 5 cards (Needs reconciliation,
  Assigned workflows, Recent operations, Inbound events)
- `app/admin/calendar/view.tsx` — the "Needs reconciliation" card
- **`features/overview/TopServices.tsx`** — both the real header and its
  skeleton. This is a card *I built this session* (the heatmap redesign
  further up this file) and never gave the stacking override I'd correctly
  applied everywhere else — the exact standing-rule lapse this file exists to
  catch, just in my own work rather than a page I was auditing.

Fixed at the primitive rather than patching 18 call sites individually (the
"generalize the underlying mechanism" call, per this project's own
`design-system.md`): `CardHeader`'s default is now
`flex flex-col items-start gap-1 p-5 pb-0` — exactly the string already
copy-pasted as an override in ~30 places. Every genuine row-usage already
carried its own explicit `flex-row`/`sm:flex-row` override or wrapped the
title+description pair in a `<div>` before a sibling badge/button, so this
default flip changes zero correct layouts — verified by reading every
`<CardHeader` call site in `src/` (57 matches) and classifying each one
before making the change, not just trusting the grep count.

Verified live, before/after, on every business-facing surface the bug
touched: Settings' Account/Appearance/Notifications/Dashboard/Security tabs
(all 5, screenshotted), Connections' needs-attention card, and Overview's Top
services card — all now stack correctly. Could not re-screenshot the two
admin-only instances (`admin/workflows`, `admin/calendar`) live — the signed-in
account (Alex Rivera, owner) correctly gets "Administrator access required"
per `tenancy-auth.md`, and no platform-operator credential was available this
pass — but the fix is the same shared primitive already proven correct on five
other pages, plus `npm run typecheck` / `npm run lint` clean, so this is
recorded as fixed-by-code-reading-and-shared-component-proof for those two,
not a live screenshot.

### Also fixed while in the area: truncated density-option hint text

While screenshotting Settings → Appearance for the CardHeader fix, noticed
"More on screen" / "Easier to scan" (the Compact/Spacious density hints)
were visibly clipped with an ellipsis. Measured live via
`scrollWidth`/`clientWidth` before assuming — genuinely clipped (85px of text
in a 76px box for "More on screen"), not a screenshot artifact. Root cause:
`AppearanceSettings.tsx` caps both the Theme and Density option rows at
`sm:max-w-md` (28rem), which divided three-up leaves each button too narrow
for its hint text at `text-xs`. Widened both rows (kept them matching each
other) to `sm:max-w-lg` (32rem) — confirmed via the same
`scrollWidth`/`clientWidth` check and a fresh screenshot that all three
density hints now render in full with no ellipsis, Theme unaffected (its
buttons have no hint text to clip), no other Settings layout shifted.

### Files touched (this entry)

- `src/components/ui/Card.tsx` — `CardHeader`'s default layout: row → column
- `src/features/settings/AppearanceSettings.tsx` — `sm:max-w-md` →
  `sm:max-w-lg` on the Theme and Density option grids

`npm run typecheck` / `npm run lint` clean after both fixes. `npm run check`
(full suite) re-run as the final gate: **38/38 test files, 531/531 tests
passed**, exit code 0, ~756s — confirms zero regression from either the
`CardHeader` default-layout change or the density-hint width change.
