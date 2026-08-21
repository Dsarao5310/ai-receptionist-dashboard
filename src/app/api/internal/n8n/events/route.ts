import { NextResponse } from "next/server";
import { ingestEvent, SIGNATURE_HEADER, TIMESTAMP_HEADER } from "@/server/integrations/n8n/inbound";
import { readBoundedBody } from "@/server/http/bounded-body";

/**
 * The one door into this application that is not a browser session.
 *
 * ── What this route is not ──────────────────────────────────────────────────
 * It is not a public write API. It does not accept a workspace id, an
 * appointment id it will act on without checking, or a "type" it will dispatch
 * blindly. It accepts a signed envelope of one of three known shapes, and every
 * decision — whose data this is, whether the payload is valid, whether the
 * event has already been applied — is made in `inbound.ts` before anything is
 * written.
 *
 * ── Under /api/internal ─────────────────────────────────────────────────────
 * The path segment is a signpost for whoever reads the route tree next, not a
 * security control: nothing about a URL prefix stops a request. What stops one
 * is the signature. Deployments that can restrict this path at the edge should
 * — defence in depth is worth having — but the endpoint is written to be safe
 * when exposed, because assuming otherwise is how "internal" endpoints end up
 * being the ones that get found.
 *
 * ── Uniform failure ─────────────────────────────────────────────────────────
 * An unauthenticated caller gets `401 {"error":"unauthorized"}` and nothing
 * else: no reason, no timing hint, no indication whether the endpoint even knows
 * what it was sent. Validation detail is returned only *after* the signature
 * has been verified, at which point the caller is our own workflow engine and
 * telling it what was wrong with its payload is the entire point.
 */

/** Never cached, never prerendered: every request has a side effect. */
export const dynamic = "force-dynamic";
const MAX_N8N_BODY_BYTES = 256 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  if (!request.headers.get(SIGNATURE_HEADER) || !request.headers.get(TIMESTAMP_HEADER)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // The raw bytes, read once. Verification must run over exactly what was sent
  // — parsing to an object and re-serialising it would change key order and
  // whitespace, and the signature would never match.
  const body = await readBoundedBody(request, MAX_N8N_BODY_BYTES);
  if (!body.ok) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });
  const rawBody = body.body;

  const outcome = await ingestEvent({
    rawBody,
    signature: request.headers.get(SIGNATURE_HEADER),
    timestamp: request.headers.get(TIMESTAMP_HEADER),
  });

  switch (outcome.status) {
    case "accepted":
      return NextResponse.json({ status: "accepted", eventId: outcome.eventId }, { status: 202 });

    case "duplicate":
      // 200 rather than a conflict: from the sender's point of view this
      // succeeded, and it should stop retrying. That is what idempotency is for.
      return NextResponse.json({ status: "duplicate", eventId: outcome.eventId }, { status: 200 });

    case "rejected":
      // Permanent. The sender should not retry, and the reason helps whoever is
      // building the workflow fix it.
      return NextResponse.json({ status: "rejected", reason: outcome.reason }, { status: 422 });

    case "unauthorized":
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    case "failed":
      // Transient. Nothing was committed, so a retry is safe and expected.
      return NextResponse.json({ status: "failed", reason: outcome.reason }, { status: 503 });
  }
}

/**
 * Anything other than POST is refused explicitly.
 *
 * A GET that fell through to a framework default could be cached by an
 * intermediary; being explicit costs four lines and removes the question.
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
