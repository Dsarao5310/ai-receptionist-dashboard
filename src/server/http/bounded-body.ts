import "server-only";

export type BoundedBody = { ok: true; body: string } | { ok: false; reason: "too_large" };

/**
 * Read an untrusted request body without ever buffering more than `maxBytes`.
 * Content-Length is an early rejection only; the stream count is authoritative
 * because chunked callers can omit or lie about that header.
 */
export async function readBoundedBody(request: Request, maxBytes: number): Promise<BoundedBody> {
  const declared = request.headers.get("content-length");
  if (declared && /^\d+$/.test(declared) && Number(declared) > maxBytes) {
    return { ok: false, reason: "too_large" };
  }

  if (!request.body) return { ok: true, body: "" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel("request body exceeds provider limit");
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, body: new TextDecoder().decode(bytes) };
}
