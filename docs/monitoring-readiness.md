# Monitoring and alerting readiness

Updated: 2026-08-27

## Decision

**LOCAL END-TO-END LIVENESS READY. PRODUCTION PUSH, EXTERNAL MONITORING, AND
ALERT OWNERSHIP NOT CONFIGURED.**

The application exposes a deliberately minimal `GET`/`HEAD` `/api/health`
liveness route. It proves that the deployed Next.js route handler can execute;
it does not claim that Postgres, a provider, a workflow, or a business operation
is healthy.

## Endpoint contract

- Returns HTTP 200 and `{ "status": "ok" }` for `GET`; `HEAD` has no body.
- Is forced dynamic on the Node.js runtime and sends browser/CDN no-store
  headers so a cached success cannot conceal an unavailable deployment.
- Exposes no version, commit, environment, database, tenant, provider,
  credential, hostname, or customer data.
- Emits one structured completion log containing only level, message, route,
  method, status, duration, and a bounded Vercel request id.
- Does not read Postgres or contact any provider. Dependency and semantic health
  remain separate authenticated or operator-controlled checks.

## Verification

- Focused route tests cover GET and HEAD, dynamic/runtime declarations,
  no-store headers, bounded structured logs, and omission of query/header data.
- Focused tests passed 2/2. The full repository gate passed TypeScript, lint,
  44/44 test files, and 572/572 tests.
- The optimized production build passed and lists `/api/health` as dynamic.
- The client-secret audit passed across 56 artifacts without printing values.
- The health route is explicitly public in the authentication proxy; focused
  route/proxy regression tests passed 6/6.
- A rebuilt production server passed unauthenticated GET and HEAD locally
  through the real proxy with HTTP 200, the minimal/body-free responses, and
  every expected no-store/nosniff header.
- Deployed HTTPS verification remains required before the endpoint is called
  production-ready.

## External work still required

1. Select an uptime service and point it at the Production `/api/health` URL.
2. Choose the probe interval, consecutive-failure threshold, recovery threshold,
   and maintenance-window procedure.
3. Assign a named primary owner, backup owner, notification route,
   acknowledgement target, and escalation path. These are intentionally not
   invented in source control.
4. Configure an error tracker or Vercel log/trace drain if the account plan and
   approved vendor policy permit it.
5. Test one controlled alert and recovery notification, then record evidence.

Until those five steps are complete, monitoring and alerting remain pilot
blockers even though the application now has a safe liveness target.
