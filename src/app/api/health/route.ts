const ROUTE = "/api/health";
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function logCompletion(request: Request, method: "GET" | "HEAD", startedAt: number): void {
  console.log(JSON.stringify({
    level: "info",
    message: "health_check_completed",
    route: ROUTE,
    method,
    status: 200,
    durationMs: Date.now() - startedAt,
    requestId: request.headers.get("x-vercel-id")?.slice(0, 128) ?? null,
  }));
}

export function GET(request: Request): Response {
  const startedAt = Date.now();
  const response = Response.json({ status: "ok" }, { headers: NO_STORE_HEADERS });
  logCompletion(request, "GET", startedAt);
  return response;
}

export function HEAD(request: Request): Response {
  const startedAt = Date.now();
  const response = new Response(null, { status: 200, headers: NO_STORE_HEADERS });
  logCompletion(request, "HEAD", startedAt);
  return response;
}
