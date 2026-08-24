# Frontend Rules

- Preserve the established quiet, warm-neutral, low-chrome visual system, restrained
  operational colors, typography, spacing, radii, and progressive disclosure.
- Defer harmless cosmetic cleanup until core functionality is complete. Do not redesign
  unrelated surfaces during backend, database, or provider phases.
- Keep significant flows usable around 375 px wide without unintended page-level overflow.
- Preserve keyboard navigation, visible focus, labels, accessible dialogs, validation
  relationships, live announcements where needed, non-color-only status, contrast, and
  reduced-motion behavior.
- Business-client UI uses Voice, SMS, Email, Calendar, AI Receptionist, and Business
  Knowledge vocabulary. Admin UI may show safe infrastructure metadata, but backend DTOs
  must enforce redaction.
- Client stores may hold UI preferences, filters, drafts, and temporary optimistic state;
  they must not become a second mutable source of business-domain truth.
- Preserve the current uncommitted UI/date work unless a later task explicitly places it
  in scope.
- Every visible control must function, be intentionally unavailable with an explanation,
  or not be rendered.
- Before changing Next.js behavior, read the relevant guide in `node_modules/next/dist/docs/`
  because this repository's version may differ from assumed APIs and conventions.
