import { NextResponse } from "next/server";
import { ingestInboundMessage, SIGNATURE_HEADER } from "@/server/integrations/twilio/inbound";
import { readBoundedBody } from "@/server/http/bounded-body";

/**
 * Inbound SMS from Twilio.
 *
 * ── The raw body is read once, and never re-serialised ──────────────────────
 * Twilio's signature is computed over the full URL plus the *decoded* form
 * parameters. Parsing to an object and rebuilding it would change ordering and
 * encoding, and verification would fail for every legitimate request. So the
 * bytes are taken as text here and parsed exactly once, inside the provider.
 *
 * ── What this route is not ──────────────────────────────────────────────────
 * It is not a public write API. It accepts no workspace id — the tenant is
 * resolved from the destination number through a mapping we issued — and it
 * dispatches nothing it has not verified first.
 *
 * ── The reply is TwiML ──────────────────────────────────────────────────────
 * Twilio expects XML and will treat a JSON body as a malformed response, which
 * shows up in the console as an application error on every single message. An
 * empty `<Response/>` means "received, send nothing back"; auto-replies are a
 * product decision, not a transport default.
 */

/** Never cached, never prerendered: every request has a side effect. */
export const dynamic = "force-dynamic";

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response/>';
const MAX_TWILIO_BODY_BYTES = 64 * 1024;

function twiml(status: number): NextResponse {
  return new NextResponse(EMPTY_TWIML, {
    status,
    headers: { "content-type": "text/xml; charset=utf-8" },
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  if (!request.headers.get(SIGNATURE_HEADER)) return new NextResponse("unauthorized", { status: 403 });
  const body = await readBoundedBody(request, MAX_TWILIO_BODY_BYTES);
  if (!body.ok) return twiml(413);
  const rawBody = body.body;

  const outcome = await ingestInboundMessage({
    rawBody,
    signature: request.headers.get(SIGNATURE_HEADER),
  });

  switch (outcome.status) {
    case "accepted":
    case "duplicate":
      // A duplicate is a success from the sender's point of view: the message
      // was applied exactly once and Twilio should stop retrying.
      return twiml(200);

    case "rejected":
      // Permanent. Twilio does not act on the body, so the status carries the
      // meaning; the reason is recorded on the inbound receipt for an operator.
      return twiml(422);

    case "unauthorized":
      // No detail, ever. "Bad signature" and "no token configured" are two free
      // hints toward forging a valid request.
      return new NextResponse("unauthorized", { status: 403 });

    case "failed":
      // Transient. Nothing was committed, so a retry is safe and expected.
      return twiml(503);
  }
}

/** Anything other than POST is refused explicitly rather than left to a default. */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
