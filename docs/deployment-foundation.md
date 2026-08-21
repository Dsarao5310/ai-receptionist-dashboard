# HTTPS deployment and Auth.js foundation

Status date: 2026-08-21 (America/Vancouver)

## Current decision

The repository is prepared for a production-shaped HTTPS deployment, but no
hosting target, domain, production Auth.js credentials, or live deployment has
been selected or created. The current machine therefore cannot certify secure
cookies, OAuth callbacks, sign-out, or tenant flows over real HTTPS.

For the first hosted environment, **Vercel is the smallest recommended path**:
Next.js lists it as a verified adapter, the application uses App Router route
handlers and server actions without a custom server, and Vercel supplies managed
HTTPS plus separate Preview and Production environment variables. This is a
recommendation, not an external change; the repository remains a standard
Node.js Next application and can run on another full-featured Node host.

Static hosting is not supported. The app requires server rendering, Auth.js
route handlers, server actions, Proxy, and direct Postgres connectivity.

## Deployment gates

Use Node.js 24 (the locally verified runtime) and these commands:

```text
npm ci
npm run check
npm run deploy:build
npm run audit:client-secrets
```

`deploy:build` validates the environment before building. It refuses weak or
missing Auth.js configuration, a non-HTTPS/local canonical origin, a database
credential other than `app_runtime`, simulated providers, partial Google
credentials, email magic links without durable token persistence, and callback
URLs that do not match the canonical deployment.

The migration credential is intentionally absent from the application runtime.
Run `npm run db:migrate` as a separate controlled release job with
`MIGRATION_DATABASE_URL`, then remove that variable from the job. Never add it to
Preview or Production application environment variables.

## Required production environment

Configure these only in the hosting provider's encrypted server environment:

| Variable | Production value |
| --- | --- |
| `AUTH_SECRET` | Independent random value, at least 32 characters. |
| `AUTH_URL` | Canonical origin only, such as `https://app.example.com`. |
| `AUTH_GOOGLE_ID` | Production Google OAuth client id. |
| `AUTH_GOOGLE_SECRET` | Production Google OAuth client secret. |
| `DATABASE_URL` | Supabase transaction-pooler URL for `app_runtime`, port 6543. |
| `N8N_MODE` | `disabled` for this phase. |
| `GOOGLE_CALENDAR_MODE` | `disabled` until its production redirect is registered and re-certified. |
| `TWILIO_MODE` | `disabled` for this phase. |

Do not configure `EMAIL_SERVER` or `EMAIL_FROM`. Auth.js requires an adapter to
persist and atomically consume verification tokens; this repository has no such
adapter. Google OAuth is the only production sign-in method in this phase.

Do not expose any variable above with a `NEXT_PUBLIC_` prefix. Do not configure
`MIGRATION_DATABASE_URL` in the application runtime.

For Preview/staging, use a stable staging hostname and a separate OAuth client,
database, `AUTH_SECRET`, and provider secrets. Random per-commit preview URLs are
not suitable as registered OAuth callback origins.

## Stable HTTPS callback contract

Replace `{origin}` with the exact `AUTH_URL` origin:

| Consumer | Exact URL | State in this phase |
| --- | --- | --- |
| Auth.js Google OAuth | `{origin}/api/auth/callback/google` | Implemented; needs production Google registration and HTTPS test. |
| Google Calendar OAuth | `{origin}/api/admin/calendar/callback` | Implemented; keep Calendar disabled until registered and re-certified. |
| n8n inbound events | `{origin}/api/internal/n8n/events` | Implemented and signed; n8n remains disabled. |
| Twilio inbound SMS | `{origin}/api/internal/twilio/sms` | Implemented and signed; Twilio remains disabled. |
| Twilio status | `{origin}/api/internal/twilio/status` | Implemented and signed; Twilio remains disabled. |
| Vapi events | No route exists | Not implemented; do not register a callback yet. |
| Email OAuth/magic link | No production route contract | Blocked on an Auth.js adapter and mail-provider selection. |

Production validation pins Google Calendar and both Twilio callbacks to these
exact paths and the same origin as `AUTH_URL`. n8n is a separate outbound
service, so `N8N_BASE_URL` may use its own public HTTPS origin.

## Auth.js and session contract

- Auth.js v5 remains the only authentication system. Supabase Auth is unused.
- Production uses an eight-hour signed JWT session in an `httpOnly`,
  `sameSite=lax`, `Secure` cookie with Auth.js's secure cookie prefix.
- `AUTH_URL` overrides request origins when Auth.js builds action and callback
  URLs. Proxy and the Google Calendar callback also use the canonical origin for
  redirects instead of trusting an incoming Host header.
- Development accounts are not registered when `NODE_ENV=production`.
- Provider identity is not tenant authority. A verified Google identity must
  resolve to an active account with an authorized workspace (or an explicitly
  assigned platform-operator role) before sign-in succeeds.
- Workspace roles are reloaded from membership on every protected operation.
  Workspace switching re-authorizes before writing an `httpOnly`, `Secure` in
  production scoping cookie.
- Proxy is optimistic navigation only. Server guards remain the authorization
  boundary for every route, read, and action.

## Human-owned setup required

1. Choose the production and staging hostnames and create the hosting projects.
2. Add the encrypted variables above separately for Preview/staging and
   Production; set the build command to `npm run deploy:build`.
3. In Google Cloud, create separate OAuth web clients and register each exact
   Auth.js callback URL. Put the matching id and secret in that environment.
4. Deploy, then verify the assigned HTTPS URL before attaching a custom domain.
5. Run the browser matrix below against the real HTTPS origin. Only after it
   passes may Auth.js be called production-verified.

## Required HTTPS browser matrix

- Signed-out protected route redirects to `/sign-in` and preserves a safe
  same-origin continuation path.
- Google sign-in succeeds for an active owner, manager, staff user, and platform
  operator; an unknown or suspended identity is denied.
- The session cookie is `Secure`, `httpOnly`, `sameSite=Lax`, has the secure
  Auth.js prefix, and is absent/expired after sign-out.
- Browser back-navigation after sign-out cannot reveal tenant content.
- Owner, manager, and staff permissions remain distinct on protected actions.
- A multi-workspace operator can switch workspaces; a tampered workspace id is
  rejected and never flashes another tenant's data.
- Database unavailability renders the service-unavailable state rather than an
  expired-session message.
- Auth.js and Calendar redirects remain on the canonical origin when the
  request carries an unexpected Host/forwarded-host value.

## Rollback

Record the previous deployment id before promotion. Application rollback must
reuse the same runtime role and remain compatible with already-applied,
forward-only migrations. Never run `db:reset` against staging or production.
