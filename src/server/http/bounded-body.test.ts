import { describe, expect, it, vi } from "vitest";
import { readBoundedBody } from "./bounded-body";

vi.mock("server-only", () => ({}));

describe("readBoundedBody", () => {
  it("rejects an oversized declared body before reading it", async () => {
    const request = new Request("https://app.example/webhook", {
      method: "POST",
      headers: { "content-length": "1000" },
      body: "small",
    });
    expect(await readBoundedBody(request, 32)).toEqual({ ok: false, reason: "too_large" });
  });

  it("rejects a chunked body whose actual bytes exceed the limit", async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("12345678"));
        controller.enqueue(new TextEncoder().encode("9"));
        controller.close();
      },
    });
    const request = new Request("https://app.example/webhook", { method: "POST", body: stream, duplex: "half" } as RequestInit);
    expect(await readBoundedBody(request, 8)).toEqual({ ok: false, reason: "too_large" });
  });

  it("preserves legitimate raw UTF-8 input", async () => {
    const request = new Request("https://app.example/webhook", { method: "POST", body: "Body=Hello%20%C3%A9" });
    expect(await readBoundedBody(request, 64)).toEqual({ ok: true, body: "Body=Hello%20%C3%A9" });
  });
});
