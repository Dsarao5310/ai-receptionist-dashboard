import { NextResponse } from "next/server";
import { readBoundedBody } from "@/server/http/bounded-body";
import { AUTHORIZATION_HEADER, ingestVapiEvent } from "@/server/integrations/vapi/inbound";

export const dynamic = "force-dynamic";

const MAX_VAPI_BODY_BYTES = 1024 * 1024;

export async function POST(request: Request): Promise<NextResponse> {
  const authorization = request.headers.get(AUTHORIZATION_HEADER);
  if (!authorization) return NextResponse.json({ error: "unauthorized" }, { status: 403 });

  const body = await readBoundedBody(request, MAX_VAPI_BODY_BYTES);
  if (!body.ok) return NextResponse.json({ error: "payload_too_large" }, { status: 413 });

  const outcome = await ingestVapiEvent({ rawBody: body.body, authorization });
  switch (outcome.status) {
    case "accepted":
    case "duplicate":
      return NextResponse.json({ received: true }, { status: 200 });
    case "rejected":
      return NextResponse.json({ error: "invalid_event" }, { status: 422 });
    case "unauthorized":
      return NextResponse.json({ error: "unauthorized" }, { status: 403 });
    case "failed":
      return NextResponse.json({ error: "temporarily_unavailable" }, { status: 503 });
  }
}

export async function GET(): Promise<NextResponse> {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
