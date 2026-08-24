# Current Task

Phase: **UI Reconstruction**

## Goal

Rebuild the interface across every screen, taking layout and composition
references from modern SaaS dashboard designs, while keeping the existing
visual system intact.

## Read first

- `.claude/rules/frontend.md`
- `.claude/rules/design-system.md`

Load other rule files only if the task actually touches those areas.

## Direction (decided, do not relitigate)

- **Patterns only, palette preserved.** Adopt layout and component ideas —
  bento composition, hero metric panels, gauge/score cards, delta chips,
  richer list rows. Keep the warm-neutral tokens, the indigo accent, light and
  dark parity, all six accent palettes and the three density modes.
- **Scope: every screen.** All twelve feature areas plus the app shell.
- **Backend verification: static gates plus read-only probes.** No live write
  smoke test; nothing mutating.

## Existing checkpoint

Branch `ui/dashboard-reconstruction`, from commit `c6fcb2a` (which committed
the thirteen previously uncommitted UI/date files unchanged).

Foundations landed in `df03c3c`.

## Execution order

1. ~~Shared foundations — KPI tiles, nav matching, `Table`, `Avatar`,
   `PageHeader`, honesty pass.~~ Done.
2. Overview and Analytics composition.
3. List pages — conversations, calls, appointments, customers.
4. Calendar views.
5. Configure and Administration screens.
6. Backend verification.

## Known defects to fix as their screen is reached

- `WeekView` tests `appointments.length` (the whole filtered set) rather than
  the week's, so an empty week renders seven "No appointments" columns.
- The date-range control is rendered above both appointment tabs but
  `allFiltered` deliberately ignores `bounds`, so it is inert on the Calendar
  tab — a visible control that does nothing.
- `SecuritySettings` marks sign-in, active sessions and team access "Planned";
  all three are live.
- Admin workflows renders raw enum values (`Not_configured`) and literal
  backticks in prose.
- `IntegrationCard`'s action bar lacks `mt-auto`, so buttons sit at different
  heights across a stretched grid row.
- Loading and error branches in the four list views are unreachable:
  `workspace-data.tsx` hardcodes `loading: false, error: false`. Decide whether
  to delete them or wire real Suspense boundaries — do not leave them dead.

## Safety

- Preserve tokens, both themes, accents and density modes.
- Keep significant flows usable at 375px with no page-level overflow.
- Preserve keyboard navigation, visible focus and non-colour-only status.
- Do not start Twilio, Vapi, or n8n live certification.

## Deferred

**n8n Live Staging Certification** is paused, not cancelled. It requires
external provisioning that is not available: a staging-only n8n instance with a
permanent HTTPS base URL, owner access, and two independent 32+ character
signing secrets. Secrets must not be pasted into chat. Resume from
`docs/n8n-live-certification.md` once those exist.

## Definition of done

Every screen rebuilt, typecheck and lint clean, the full suite passing, no
page-level overflow at 375px, and no visible control that does nothing.
