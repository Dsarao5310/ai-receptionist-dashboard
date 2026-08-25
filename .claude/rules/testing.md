# Testing and Verification Rules

- Start with the smallest targeted tests for changed behavior, then run the focused
  subsystem suite.
- Run typecheck and lint after focused behavior is stable.
- Run the consolidated/full suite once near completion when the change warrants it, then
  run the fail-closed production build once. Run the client-secret audit when relevant.
- Do not repeatedly rerun the full suite while iterating.
- Never claim a test, build, browser check, live provider call, migration, or deployment
  was performed when it was not.
- Simulator coverage is not live verification. State the evidence level explicitly.
- Keep tests deterministic. Inject clocks for time-sensitive logic and keep automated
  provider tests in simulated modes.
- Persistence, authorization, inbound-provider, and repository changes require tenant
  tampering, forged-role, foreign-record, replay/idempotency, and cross-workspace tests.
- Distinguish environment or missing-credential failures from application defects; do not
  weaken fail-closed behavior to make an environment pass.
- When HMR or browser state may be stale, verify the corrected behavior in a fresh tab or
  session and separate stale console output from current failures.
