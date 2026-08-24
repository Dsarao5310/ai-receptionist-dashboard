# Current Project State

Updated: 2026-08-23

## Repository checkpoint

Latest readiness commit: `879d2af41d9469b401db398af0ea50f583262614`

Message: `chore: prepare n8n staging certification and release gates`

The readiness work is committed. Thirteen pre-existing UI/date files remain
intentionally uncommitted and must be preserved.

## Verified systems

- Supabase persistence: **LIVE VERIFIED**
- Auth.js Google OAuth: **LIVE VERIFIED**
- Hosted staging RBAC matrix: **LIVE VERIFIED**
- Cross-tenant authorization: **LIVE VERIFIED**
- Google Calendar: **LIVE VERIFIED**

## Provider status

- Google Calendar: **LIVE VERIFIED**
- n8n: application-side integration/readiness complete; live staging certification
  pending an external n8n instance and configuration.
- Twilio: **BUILT + SIMULATOR VERIFIED**; not live-certified.
- Vapi: **NOT STARTED**
- Gmail/email: **NOT STARTED**
- Knowledge/Pinecone: **NOT STARTED**
- Model provider: **NOT STARTED**

## Latest verification

- Focused readiness suite: 96 passed.
- Consolidated suite: 437 tests across 25 files passed.
- Typecheck passed.
- Lint passed.
- Fail-closed production build passed.
- Client-secret audit passed.

These results are the current repository checkpoint; rerun them only when relevant work changes.

## Current priority

n8n live staging provisioning and certification.
Do not start Twilio or Vapi unless `.claude/CURRENT_TASK.md` changes.
