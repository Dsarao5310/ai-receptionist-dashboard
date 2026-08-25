import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyCronAuthorization } from "./cron-auth";

vi.mock("server-only", () => ({}));

const runPrivacyPurge = vi.hoisted(() => vi.fn());
vi.mock("@/server/privacy/scheduler", () => ({ runPrivacyPurge }));

import { GET, POST } from "@/app/api/internal/cron/privacy-purge/route";

const SECRET = "privacy-cron-secret-with-32-characters";
const priorMode = process.env.PRIVACY_PURGE_MODE;
const priorSecret = process.env.CRON_SECRET;

afterEach(() => {
  if (priorMode === undefined) delete process.env.PRIVACY_PURGE_MODE;
  else process.env.PRIVACY_PURGE_MODE = priorMode;
  if (priorSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = priorSecret;
  runPrivacyPurge.mockReset();
});

describe("privacy cron authentication", () => {
  it("fails closed for missing, weak, malformed, or wrong credentials", () => {
    expect(verifyCronAuthorization(null, SECRET)).toBe(false);
    expect(verifyCronAuthorization(`Bearer ${SECRET}`, "short")).toBe(false);
    expect(verifyCronAuthorization(SECRET, SECRET)).toBe(false);
    expect(verifyCronAuthorization("Bearer wrong", SECRET)).toBe(false);
  });

  it("accepts only the exact configured bearer value", () => {
    expect(verifyCronAuthorization(`Bearer ${SECRET}`, SECRET)).toBe(true);
  });
});

describe("privacy cron route", () => {
  it("is a no-op while disabled and never reaches the database runner", async () => {
    process.env.PRIVACY_PURGE_MODE = "disabled";
    delete process.env.CRON_SECRET;
    const response = await GET(new Request("https://app.example.com/api/internal/cron/privacy-purge"));
    expect(response.status).toBe(204);
    expect(runPrivacyPurge).not.toHaveBeenCalled();
  });

  it("refuses scheduled execution before invoking the runner", async () => {
    process.env.PRIVACY_PURGE_MODE = "scheduled";
    process.env.CRON_SECRET = SECRET;
    const response = await GET(new Request("https://app.example.com/api/internal/cron/privacy-purge", {
      headers: { authorization: "Bearer wrong" },
    }));
    expect(response.status).toBe(401);
    expect(runPrivacyPurge).not.toHaveBeenCalled();
  });

  it("returns bounded aggregate success and overlap results", async () => {
    process.env.PRIVACY_PURGE_MODE = "scheduled";
    process.env.CRON_SECRET = SECRET;
    runPrivacyPurge.mockResolvedValueOnce({
      status: "completed",
      runId: "pgr_test",
      workspacesProcessed: 1,
      callsProcessed: 2,
      transcriptsErased: 2,
      recordingsErased: 0,
    });
    const request = new Request("https://app.example.com/api/internal/cron/privacy-purge", {
      headers: { authorization: `Bearer ${SECRET}` },
    });
    const response = await GET(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      status: "completed",
      runId: "pgr_test",
      workspacesProcessed: 1,
      callsProcessed: 2,
      transcriptsErased: 2,
      recordingsErased: 0,
    });

    runPrivacyPurge.mockResolvedValueOnce({ status: "skipped", reason: "lease_held" });
    const skipped = await GET(request);
    expect(skipped.status).toBe(200);
    expect(await skipped.json()).toEqual({ ok: true, status: "skipped", reason: "lease_held" });
  });

  it("normalizes runner failure and rejects POST", async () => {
    process.env.PRIVACY_PURGE_MODE = "scheduled";
    process.env.CRON_SECRET = SECRET;
    runPrivacyPurge.mockResolvedValueOnce({
      status: "failed",
      runId: "pgr_failed",
      errorCode: "privacy_purge_failed",
      workspacesProcessed: 0,
      callsProcessed: 0,
      transcriptsErased: 0,
      recordingsErased: 0,
    });
    const response = await GET(new Request("https://app.example.com/api/internal/cron/privacy-purge", {
      headers: { authorization: `Bearer ${SECRET}` },
    }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "privacy_purge_failed", runId: "pgr_failed" });
    expect((await POST()).status).toBe(405);
  });
});
