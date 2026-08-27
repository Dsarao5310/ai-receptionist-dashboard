# Current Task

Phase: **Monitoring and alerting foundation**

Status: **LOCAL END-TO-END LIVENESS VERIFIED — PRODUCTION PUSH EXPLICITLY GATED — 2026-08-27**

## Authoritative checkpoint

- Local `master` is at monitoring commit `d1b2d84`; `origin/master` remains
  `7cad923` because the Production-triggering push was rejected by the safety
  gate pending explicit approval for that exact action.
  `origin/staging` remains isolated at `64fa59a`.
- The working tree contains the new health route, its tests, monitoring docs,
  and this state update. The pre-existing untracked `.claude/worktrees/` is not
  part of the task and must remain untouched.
- Claude's concurrent `7cad923` coordination change is understood and does not
  overlap this route or documentation work.

## Completed locally

- Added public `GET` and `HEAD /api/health` deployment liveness.
- The route is forced dynamic on the Node.js runtime and returns no-store
  browser/CDN headers so a cached success cannot conceal an outage.
- `GET` returns only `{ "status": "ok" }`; `HEAD` is body-free.
- The route reads no database, provider, tenant, environment, or customer data.
- Its structured completion log is content-free and excludes query strings and
  authorization headers.
- Added operator guidance in `docs/monitoring-readiness.md` and
  `docs/operations-runbook.md`.
- Added `/api/health` to the proxy's narrow public allowlist. Auth.js and all
  business routes remain protected; the liveness route alone is reachable by an
  unauthenticated uptime probe.

## Verification

- Focused route tests: **2/2 passed**.
- Full repository gate: typecheck and full lint passed; **44/44 test files and
  572/572 tests passed** under the whole-run Postgres advisory lock.
- Production Next.js build passed and lists `/api/health` as a dynamic route.
- Client-secret audit passed across **56 artifacts** without printing values.
- Focused health/proxy regression gate passed **6/6** after runtime verification
  found and corrected the original sign-in redirect.
- The rebuilt production server was exercised locally through the real proxy:
  GET and HEAD returned 200, GET returned only `{ "status": "ok" }`, HEAD had
  no body, and all no-store/nosniff headers were present.

## Runtime boundary and next action

The local endpoint is ready to deploy and verify over Production HTTPS. Pushing
`master` triggers a Production release and is waiting for explicit approval for
that exact push. External
monitoring is not complete: no uptime vendor, error/log drain, named primary or
backup owner, paging route, thresholds, acknowledgement target, escalation path,
or controlled alert/recovery test has been configured.

After explicit push approval and deployed HTTPS verification, the next safe implementation work is the
isolated restore-drill preparation. Actually configuring a monitoring vendor,
running a restore drill against remote data, or enabling provider traffic needs
the relevant external access and approval.
