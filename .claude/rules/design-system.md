# Design System Rules

Composition conventions for the shared UI layer. Read alongside
`.claude/rules/frontend.md`, which owns the visual system and accessibility
requirements. This file owns *how components are structured*, not what they
look like.

## Tokens are the only source of colour

- Never hard-code a colour, including inside `PALETTE`-style arrays. Every
  surface, text, border and status colour resolves from `src/app/globals.css`.
- Pair a `*-bg` token with its matching foreground token so both themes and all
  six accent palettes recolour automatically.
- A component that needs a tint it cannot express in tokens is a signal the
  token set is missing something — extend `globals.css` rather than escaping it.

## Page structure

- The application chrome renders the route's name as the page `h1`
  (`AppShell` → `TopBar`). A page must not print its own title again; that is
  what produced duplicate and competing headings.
- `components/shared/PageHeader` owns the supporting half of the header —
  description and primary actions. It deliberately has no `title` prop.
- A page needing a second-level heading inside its content uses a real `h2`,
  never another copy of the page name.

## Route matching

- `isNavItemActive` and `findNavItem` in `src/lib/nav-config.ts` are the only
  place a route is compared to a nav item. Never re-implement exact equality:
  it silently drops nested routes, taking the sidebar highlight and the page
  heading with them.
- `/` is matched exactly; every other item matches itself and its descendants.

## Metric tiles

- `KPICard` stacks label, value+delta, then sparkline as three rows. The label
  gets the full card width — it must never share a row with a fixed-width
  sibling, which is what forced mid-word breaking.
- Direction is carried by an arrow icon as well as colour, so the delta is
  readable without relying on hue.
- Emphasis is expressed through the card's own accent treatment, never by
  spanning extra grid columns; a span makes every sibling narrower and leaves
  the row ragged at breakpoints where it does not divide evenly.
- KPI grids step `grid-cols-2 md:grid-cols-3 xl:grid-cols-6`. Skipping the `md`
  step strands tall cards in two columns through the whole tablet range.

## Tables

- `Table` takes a `minWidth` prop. State what the content needs; a shared fixed
  minimum is simultaneously too wide for short tables and far too narrow for
  wide ones.
- `TableHeader` is not sticky. Sticky positioning resolves against the nearest
  scrolling ancestor, which for these tables is the horizontal wrapper — so it
  never sticks, and where it does resolve it slides under the top bar.
- The scroll region is keyboard-reachable. Columns that scroll out of view
  often hold the row's actions, so a pointer-only scroll container hides
  functionality rather than merely inconveniencing.
- Do not wrap `Table` in another `overflow-x-auto`; it already provides one.

## Density and responsive

- Dimensions that should track density read `--density-row-h` /
  `--density-control-h`. A hardcoded height opts that element out of the three
  density modes silently.
- Grid column counts must be derived when the collection is permission-filtered.
  A fixed count over a variable list leaves dead cells for some roles.

## Honesty in the interface

- Every visible control functions, is intentionally unavailable with a stated
  reason, or is not rendered.
- A label asserting where a value came from must actually read from that source.
  Hardcoding a role, status or mode underneath a description promising it was
  server-resolved is a defect, not a placeholder.
- Copy describing the data's origin has to track the code. Strings referring to
  generated or demo data are wrong once a surface is server-backed.
