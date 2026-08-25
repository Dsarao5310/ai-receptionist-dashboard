# Model Provider

Status: **APPLICATION-READY + SIMULATOR VERIFIED**

## Implemented boundary

- Server implementation: `src/server/integrations/model-provider/`.
- `MODEL_PROVIDER_MODE=disabled|simulated|live`; production rejects simulated.
- Live transport uses Vercel AI Gateway through AI SDK 6.0.265, compatible with
  the repository's pinned Node 20 CI runtime.
- Approved policy is intentionally narrow: `openai/gpt-5.4-mini` primary and
  `anthropic/claude-haiku-4.5` fallback. Live mode requires both explicitly and
  refuses duplicates or unknown models.
- Authentication is server-only through `AI_GATEWAY_API_KEY` or deployment-
  managed `VERCEL_OIDC_TOKEN`.
- Calls require a server execution context with workspace attribution and a
  trusted source. No browser route or client SDK is exposed.

## Safety and budget policy

- Customer messages, transcripts, and business context are untrusted prompt
  content. Static instructions prohibit prompt disclosure, unsupported facts,
  and claims that external actions happened.
- Reply and call-analysis outputs are strict Zod objects; no arbitrary tool call
  or appointment mutation exists.
- Requests are bounded by field size, message/transcript count, estimated input
  tokens, output tokens, total timeout, one retry, and a conservative micro-USD
  preflight ceiling that includes both attempts and the more expensive approved
  model.
- Gateway routing requests zero-data-retention and no-training providers, tags
  the fixed prompt version, and attributes usage to the trusted workspace.
- Raw SDK errors, response bodies, URLs, prompts, credentials, and model ids do
  not enter client DTOs or normalized provider errors.

## Evidence boundary

Deterministic fixtures cover ordinary questions, incomplete booking requests,
human escalation, prompt injection, and post-call booking analysis. Focused
tests also cover invalid/oversized input, cost refusal, disabled/live fail-
closed behavior, approved model policy, safe error normalization, adapter state,
and client import boundaries.

No gateway account, key, OIDC session, deployment variable, live request,
latency measurement, provider failover observation, or billed usage was used.
Do not call this live-connected or live-certified.

## Next live phase

Use an isolated staging gateway/project and explicit spend cap. Confirm the
approved ids and prices again, install server-only authentication, run the eval
matrix against both primary and forced fallback, measure p50/p95 latency and
real token/cost usage, test 401/402/429/timeout behavior, inspect redacted logs,
then remove all test data and credentials. Vapi coupling remains a separate
assignment.
