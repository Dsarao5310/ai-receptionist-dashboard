import { NextResponse } from "next/server";
import { ingestDeliveryStatus, SIGNATURE_HEADER } from "@/server/integrations/twilio/inbound";
import { readBoundedBody } from "@/server/http/bounded-body";

/**
 * Delivery receipts from Twilio.
 *
 * ── Why this is a separate route from inbound messages ──────────────────────
 * Not tidiness. Twilio signs the exact URL it was configured to call, so two
 * endpoints mean two signed values — verifying a status callback against the
 * inbound message URL would reject every legitimate receipt. The URLs are
 * configuration (`TWILIO_STATUS_CALLBACK_URL`), and the split is what makes
 * both verifiable.
 *
 * ── What arrives here is the truth the send did not have ────────────────────
 * `POST /Messages` returning `queued` means the carrier accepted the message.
 * Whether a handset ever received it is decided later, and reported here. This
 * is the Twilio shape of the lesson Google Calendar taught with cancelled-event
 * tombstones: transport success is not domain success.
 */

export const dynamic = "force-dynamic";
const MAX_TWILIO_BODY_BYTES = 64 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  if (!request.headers.get(SIGNATURE_HEADER)) return new NextResponse("unauthorized", { status: 403 });
  const body = await readBoundedBody(request, MAX_TWILIO_BODY_BYTES);
  if (!body.ok) return new NextResponse(null, { status: 413 });
  const rawBody = body.body;

  const outcome = await ingestDeliveryStatus({
    rawBody,
    signature: request.headers.get(SIGNATURE_HEADER),
  });

  switch (outcome.status) {
    case "accepted":
    case "duplicate":
      // Twilio ignores the body of a status callback response; only the code
      // matters. 204 says "recorded, nothing to say".
      return new NextResponse(null, { status: 204 });

    case "rejected":
      return new NextResponse(null, { status: 422 });

    case "unauthorized":
      return new NextResponse("unauthorized", { status: 403 });

    case "failed":
      return new NextResponse(null, { status: 503 });
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
