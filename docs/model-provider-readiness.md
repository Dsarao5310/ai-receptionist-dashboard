# Model provider readiness

Current status: **APPLICATION-READY + SIMULATOR VERIFIED**. No AI Gateway or
model-provider account, credential, deployment setting, live request, or billed
usage was used.

## Application contract

The server-only provider supports two bounded tasks:

1. Compose a concise receptionist reply with `respond`, `clarify`, or `escalate`
   action and an explicit safe reason.
2. Produce strict post-call analysis with a supported summary, sentiment,
   outcome, follow-up flag, and bounded tags.

Neither task can execute tools or mutate appointments. A request to book is
represented as `booking_requested`; it is never converted into a claim that a
booking exists.

## Model and transport policy

- AI SDK: `ai@6.0.265`, chosen because it supports Node 20 used by CI.
- Transport: Vercel AI Gateway, server-only.
- Primary: `openai/gpt-5.4-mini`.
- Fallback: `anthropic/claude-haiku-4.5`.
- Authentication: `AI_GATEWAY_API_KEY` or deployment-managed
  `VERCEL_OIDC_TOKEN`; neither is browser-visible.
- Gateway options request zero data retention and disallow prompt training.
- Usage is attributed to the trusted workspace and fixed prompt-version tags.

The model ids and public token pricing were rechecked on 2026-08-26 against the
[AI Gateway model catalog](https://ai-gateway.vercel.sh/v1/models). Recheck both
before live certification; model availability and pricing are external state.
Implementation follows the [official AI Gateway documentation](https://vercel.com/docs/ai-gateway)
and the [AI SDK structured-output contract](https://ai-sdk.dev/docs/ai-sdk-core/generating-structured-data).

## Enforced limits

| Control | Default | Live validation |
| --- | ---: | --- |
| Total timeout | 8,000 ms | 1,000–30,000 ms |
| Estimated input | 6,000 tokens | 256–12,000 tokens |
| Output | 350 tokens | 64–1,000 tokens |
| SDK retries | 1 | fixed |
| Conservative request ceiling | 10,000 micro-USD ($0.01) | 1,000–100,000 micro-USD |

Input estimation reserves 512 tokens for static instructions, schema, and
formatting. Cost preflight uses the more expensive approved model and multiplies
by both possible attempts. This is a request guardrail, not proof of a gateway
account-level hard budget; staging certification must configure and verify the
external spend cap separately.

## Security boundary

- Every entry module is marked `server-only`; no client route was added.
- Execution context carries a trusted workspace id, invocation id, and source.
- Customer messages and transcripts are serialized as untrusted content below
  static instructions.
- Inputs have strict shape, count, and character bounds; outputs are strict Zod
  objects with bounded strings and enums.
- Provider errors are mapped to safe application codes. Raw bodies, request
  payloads, credential fragments, upstream URLs, model ids, and hidden prompts
  are not returned.
- AI SDK structured-output parse/schema failures (`NoObjectGeneratedError`) and
  missing final output (`NoOutputGeneratedError`) both map to the sanitized,
  retryable `model_invalid_response` application error.
- The existing client import-closure test proves business-facing pages cannot
  reach server integration modules.

## Simulator evidence

Deterministic fixtures verify:

- ordinary service questions;
- booking requests that still need details;
- explicit human escalation;
- prompt-injection text treated as customer content;
- call analysis that distinguishes a request from a confirmed booking;
- invalid and oversized request refusal;
- conservative token/cost refusal;
- disabled and incomplete-live fail-closed behavior;
- approved distinct primary/fallback policy;
- sanitized auth, rate-limit, and timeout errors;
- sanitized malformed structured-output errors without generated text or model
  metadata leakage;
- adapter capability state and browser boundary protection.

Simulator output costs zero and is always labelled `simulated: true`. It is not
evidence of model quality, provider latency, fallback, authentication, billing,
or data-handling behavior in a real account.

## Live certification still required

1. Create an isolated staging gateway/project and account-level spend cap.
2. Recheck the model catalog, prices, ZDR/no-training availability, regions, and
   the approved allowlist.
3. Configure one server-only auth method without pasting secrets into chat or
   committing them.
4. Run the same fixtures against the primary, then force and verify fallback.
5. Measure p50/p95 time-to-first-response and total latency under the voice
   timeout budget.
6. Verify real input/output usage, conservative cost accounting, 401, 402, 429,
   provider outage, invalid output, timeout, and retry behavior.
7. Inspect gateway/runtime logs for prompt, transcript, tenant, model, URL, raw
   error, and credential leakage; keep content logging disabled.
8. Remove staging prompts/results and rotate or revoke temporary credentials.

Only after that matrix passes may the model provider be called live-certified.
Connecting it to Vapi is a separate phase with its own latency, interruption,
fallback, tool, and call-safety tests.
