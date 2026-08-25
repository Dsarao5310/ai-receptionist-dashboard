import { NextResponse } from "next/server";
import { serverEnv } from "@/server/env";
import { verifyCronAuthorization } from "@/server/privacy/cron-auth";
import { runPrivacyPurge } from "@/server/privacy/scheduler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request): Promise<NextResponse> {
  if (serverEnv.privacyPurgeMode === "disabled") {
    return new NextResponse(null, { status: 204 });
  }

  if (!verifyCronAuthorization(request.headers.get("authorization"), serverEnv.cronSecret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await runPrivacyPurge();
  if (result.status === "failed") {
    return NextResponse.json({ ok: false, error: result.errorCode, runId: result.runId }, { status: 503 });
  }
  if (result.status === "skipped") {
    return NextResponse.json({ ok: true, status: "skipped", reason: result.reason });
  }
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(): Promise<NextResponse> {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
