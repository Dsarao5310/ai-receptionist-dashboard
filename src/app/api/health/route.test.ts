import { afterEach, describe, expect, it, vi } from "vitest";
import { dynamic, GET, HEAD, runtime } from "./route";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("public liveness route", () => {
  it("returns a minimal dynamic no-store response", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = GET(new Request("https://app.example.com/api/health?ignored=customer-data", {
      headers: { "x-vercel-id": "iad1::safe-request-id" },
    }));

    expect(dynamic).toBe("force-dynamic");
    expect(runtime).toBe("nodejs");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
    expect(response.headers.get("cache-control")).toBe("no-store, max-age=0");
    expect(response.headers.get("cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("vercel-cdn-cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");

    const event = JSON.parse(String(log.mock.calls[0]?.[0]));
    expect(event).toMatchObject({
      level: "info",
      message: "health_check_completed",
      route: "/api/health",
      method: "GET",
      status: 200,
      requestId: "iad1::safe-request-id",
    });
    expect(event.durationMs).toEqual(expect.any(Number));
    expect(JSON.stringify(event)).not.toContain("customer-data");
  });

  it("supports body-free HEAD probes without exposing request metadata", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const response = HEAD(new Request("https://app.example.com/api/health", {
      headers: { authorization: "Bearer must-not-be-logged" },
    }));

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
    const serialized = String(log.mock.calls[0]?.[0]);
    expect(serialized).toContain('"method":"HEAD"');
    expect(serialized).not.toContain("must-not-be-logged");
  });
});
