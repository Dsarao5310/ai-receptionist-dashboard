import { describe, expect, it, vi } from "vitest";
import {
  parseBookedEvent,
  parseCancelledEvent,
  parseExecutionEvent,
  parseInboundEnvelope,
  parseOutboundResult,
} from "./contract";
import { MAX_CLOCK_SKEW_SECONDS, sign, verify } from "./signing";
import { Secret } from "@/server/integrations/credential-store";

/**
 * The wire boundary, tested without a database or a network.
 *
 * Everything here is a pure function of its inputs, which is deliberate: the
 * checks that decide whether a request is authentic and whether a payload is
 * meaningful should be provable on their own, not only as a side effect of an
 * integration test that could pass for the wrong reason.
 */

vi.mock("server-only", () => ({}));

const NOW = new Date("2026-08-18T12:00:00.000Z");
const secret = new Secret("a-test-signing-secret");

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    eventId: "evt_1",
    eventType: "appointment.cancelled",
    workflowRef: "wf_test",
    occurredAt: "2026-08-18T11:59:00.000Z",
    data: { appointmentId: "apt_1" },
    ...overrides,
  };
}

describe("secrets refuse to render themselves", () => {
  it("hides the value from every string conversion", () => {
    const s = new Secret("super-secret-value");

    expect(`${s}`).toBe("[redacted]");
    expect(JSON.stringify({ s })).toBe('{"s":"[redacted]"}');
    expect(String(s)).toBe("[redacted]");
    // The private field is not enumerable, so a spread carries nothing.
    expect(JSON.stringify({ ...s })).toBe("{}");
    // And the value is still there for the one caller entitled to it.
    expect(s.expose()).toBe("super-secret-value");
  });
});

describe("request signing", () => {
  it("accepts a signature it produced", () => {
    const body = JSON.stringify(envelope());
    const { signature, timestamp } = sign(body, secret, NOW);

    expect(verify({ body, signature, timestamp: String(timestamp), secret, now: NOW })).toEqual({ valid: true });
  });

  it("rejects a body that changed after signing", () => {
    const body = JSON.stringify(envelope());
    const { signature, timestamp } = sign(body, secret, NOW);
    const tampered = JSON.stringify(envelope({ eventId: "evt_2" }));

    expect(verify({ body: tampered, signature, timestamp: String(timestamp), secret, now: NOW })).toEqual({
      valid: false,
      reason: "invalid_signature",
    });
  });

  it("rejects a signature made with a different secret", () => {
    const body = JSON.stringify(envelope());
    const { signature, timestamp } = sign(body, new Secret("someone-elses-secret"), NOW);

    expect(verify({ body, signature, timestamp: String(timestamp), secret, now: NOW })).toEqual({
      valid: false,
      reason: "invalid_signature",
    });
  });

  it("rejects a replayed request once the window has passed", () => {
    const body = JSON.stringify(envelope());
    const { signature, timestamp } = sign(body, secret, NOW);
    const later = new Date(NOW.getTime() + (MAX_CLOCK_SKEW_SECONDS + 1) * 1000);

    expect(verify({ body, signature, timestamp: String(timestamp), secret, now: later })).toEqual({
      valid: false,
      reason: "stale_timestamp",
    });
  });

  it("rejects a timestamp from the future as well as one from the past", () => {
    // Otherwise a sender with a fast clock holds a request that stays valid for
    // as long as their clock is ahead.
    const body = JSON.stringify(envelope());
    const ahead = new Date(NOW.getTime() + 3600_000);
    const { signature, timestamp } = sign(body, secret, ahead);

    expect(verify({ body, signature, timestamp: String(timestamp), secret, now: NOW })).toEqual({
      valid: false,
      reason: "stale_timestamp",
    });
  });

  it("rejects a moved timestamp, because the timestamp is signed", () => {
    const body = JSON.stringify(envelope());
    const { signature } = sign(body, secret, new Date(NOW.getTime() - 3600_000));
    const movedForward = String(Math.floor(NOW.getTime() / 1000));

    expect(verify({ body, signature, timestamp: movedForward, secret, now: NOW })).toEqual({
      valid: false,
      reason: "invalid_signature",
    });
  });

  it("refuses everything when no secret is configured", () => {
    const body = JSON.stringify(envelope());
    const { signature, timestamp } = sign(body, secret, NOW);

    expect(verify({ body, signature, timestamp: String(timestamp), secret: null, now: NOW })).toEqual({
      valid: false,
      reason: "no_secret_configured",
    });
  });

  it("rejects missing, malformed and wrongly-versioned signatures", () => {
    const body = JSON.stringify(envelope());
    const t = String(Math.floor(NOW.getTime() / 1000));

    expect(verify({ body, signature: null, timestamp: t, secret, now: NOW })).toEqual({
      valid: false,
      reason: "missing_signature",
    });
    expect(verify({ body, signature: "v1=abc", timestamp: null, secret, now: NOW })).toEqual({
      valid: false,
      reason: "missing_timestamp",
    });
    expect(verify({ body, signature: "nonsense", timestamp: t, secret, now: NOW })).toEqual({
      valid: false,
      reason: "malformed_signature",
    });
    expect(verify({ body, signature: "v2=abc", timestamp: t, secret, now: NOW })).toEqual({
      valid: false,
      reason: "unsupported_version",
    });
  });

  it("does not throw on a signature of the wrong length", () => {
    // timingSafeEqual throws on differing lengths, and the length is entirely
    // caller-controlled. A crash here would be a denial of service at best.
    const body = JSON.stringify(envelope());
    const t = String(Math.floor(NOW.getTime() / 1000));

    expect(verify({ body, signature: "v1=00", timestamp: t, secret, now: NOW })).toEqual({
      valid: false,
      reason: "invalid_signature",
    });
  });
});

describe("inbound envelope validation", () => {
  it("accepts a well-formed envelope", () => {
    const parsed = parseInboundEnvelope(envelope());
    expect(parsed.ok).toBe(true);
  });

  it("rejects an unknown event type", () => {
    const parsed = parseInboundEnvelope(envelope({ eventType: "appointment.deleted" }));
    expect(parsed).toEqual({ ok: false, error: "unknown eventType" });
  });

  it("rejects an unsupported schema version", () => {
    const parsed = parseInboundEnvelope(envelope({ schemaVersion: 2 }));
    expect(parsed.ok).toBe(false);
  });

  it("rejects a missing schema version rather than assuming version 1", () => {
    const { schemaVersion: _omitted, ...rest } = envelope();
    void _omitted;
    expect(parseInboundEnvelope(rest).ok).toBe(false);
  });

  it("rejects a timestamp with no UTC offset", () => {
    // The whole point of the provider-time boundary: a bare wall clock is a
    // reading on an unnamed clock, and adopting the server's zone silently is
    // how a booking ends up hours out.
    const parsed = parseInboundEnvelope(envelope({ occurredAt: "2026-08-18T11:59:00" }));
    expect(parsed).toEqual({
      ok: false,
      error: "occurredAt must be an ISO 8601 instant with a UTC offset",
    });
  });

  it("accepts an offset that is not UTC", () => {
    expect(parseInboundEnvelope(envelope({ occurredAt: "2026-08-18T04:59:00-07:00" })).ok).toBe(true);
  });

  it("rejects non-objects, arrays and absent fields", () => {
    expect(parseInboundEnvelope(null).ok).toBe(false);
    expect(parseInboundEnvelope([]).ok).toBe(false);
    expect(parseInboundEnvelope("{}").ok).toBe(false);
    expect(parseInboundEnvelope(envelope({ eventId: "" })).ok).toBe(false);
    expect(parseInboundEnvelope(envelope({ workflowRef: 42 })).ok).toBe(false);
  });

  it("rejects an absurdly long field rather than passing it to the database", () => {
    expect(parseInboundEnvelope(envelope({ eventId: "x".repeat(5000) })).ok).toBe(false);
  });

  it("ignores a workspaceId in the payload — there is no field for one", () => {
    const parsed = parseInboundEnvelope(envelope({ workspaceId: "ws_someone_else" }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value).not.toHaveProperty("workspaceId");
  });

  it("treats an empty optional executionRef the same as an absent one", () => {
    // n8n's own payload construction routinely sends "" rather than omitting
    // a key when nothing was captured. An empty *optional* field is not a
    // malformed envelope, and must not refuse the whole delivery.
    const parsed = parseInboundEnvelope(envelope({ executionRef: "" }));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.value.executionRef).toBeUndefined();
  });

  it("still refuses a wrongly-typed or absurdly long optional field", () => {
    expect(parseInboundEnvelope(envelope({ executionRef: 42 })).ok).toBe(false);
    expect(parseInboundEnvelope(envelope({ executionRef: "x".repeat(5000) })).ok).toBe(false);
  });
});

describe("event payload validation", () => {
  it("accepts a complete booking", () => {
    const parsed = parseBookedEvent({
      customer: { name: "Jordan Blake", phone: "+1 604 555 0101", email: "" },
      serviceId: "svc_haircut",
      date: "2026-08-20",
      time: "10:30",
      notes: "First visit",
      source: "voice",
    });
    expect(parsed.ok).toBe(true);
  });

  it("rejects a booking with no way to reach the customer", () => {
    const parsed = parseBookedEvent({
      customer: { name: "Jordan Blake", phone: "", email: "" },
      date: "2026-08-20",
      time: "10:30",
      source: "voice",
    });
    expect(parsed).toEqual({ ok: false, error: "customer needs a phone or an email" });
  });

  it("rejects malformed dates and times", () => {
    const base = {
      customer: { name: "Jordan Blake", phone: "+1 604 555 0101" },
      source: "voice" as const,
    };
    expect(parseBookedEvent({ ...base, date: "20/08/2026", time: "10:30" }).ok).toBe(false);
    expect(parseBookedEvent({ ...base, date: "2026-08-20", time: "25:00" }).ok).toBe(false);
    expect(parseBookedEvent({ ...base, date: "2026-08-20", time: "10:30:00" }).ok).toBe(false);
  });

  it("rejects an unknown source", () => {
    const parsed = parseBookedEvent({
      customer: { name: "Jordan Blake", phone: "+1 604 555 0101" },
      date: "2026-08-20",
      time: "10:30",
      source: "carrier_pigeon",
    });
    expect(parsed.ok).toBe(false);
  });

  it("validates cancellations and execution reports", () => {
    expect(parseCancelledEvent({ appointmentId: "apt_1" }).ok).toBe(true);
    expect(parseCancelledEvent({}).ok).toBe(false);
    expect(parseExecutionEvent({ outcome: "succeeded" }).ok).toBe(true);
    expect(parseExecutionEvent({ outcome: "maybe" }).ok).toBe(false);
  });

  it("does not refuse a booking over an empty notes or serviceId — the receipt of a call where neither was captured", () => {
    // The receptionist not identifying a service, or taking no notes, is a
    // normal outcome of a voice call — not a malformed booking. n8n sends
    // these as "" rather than omitting the key, and this must fall through
    // to the same "nothing captured" handling an absent key gets, not refuse
    // the whole booking.
    const parsed = parseBookedEvent({
      customer: { name: "Jordan Blake", phone: "+1 604 555 0101" },
      serviceId: "",
      date: "2026-08-20",
      time: "10:30",
      notes: "",
      source: "voice",
    });
    expect(parsed).toEqual({
      ok: true,
      value: {
        customer: { name: "Jordan Blake", phone: "+1 604 555 0101", email: "" },
        serviceId: null,
        date: "2026-08-20",
        time: "10:30",
        notes: "",
        source: "voice",
      },
    });
  });

  it("still refuses a serviceId or notes of the wrong type", () => {
    const base = {
      customer: { name: "Jordan Blake", phone: "+1 604 555 0101" },
      date: "2026-08-20",
      time: "10:30",
      source: "voice" as const,
    };
    expect(parseBookedEvent({ ...base, serviceId: 42 }).ok).toBe(false);
    expect(parseBookedEvent({ ...base, notes: 42 }).ok).toBe(false);
  });

  it("does not refuse a cancellation or execution report over an empty optional field", () => {
    expect(parseCancelledEvent({ appointmentId: "apt_1", reason: "" })).toEqual({
      ok: true,
      value: { appointmentId: "apt_1", reason: "" },
    });
    expect(parseExecutionEvent({ outcome: "succeeded", operationId: "", detail: "" })).toEqual({
      ok: true,
      value: { outcome: "succeeded", operationId: undefined, detail: undefined },
    });
  });
});

describe("outbound response validation", () => {
  it("accepts a well-formed result", () => {
    expect(parseOutboundResult({ status: "succeeded", executionRef: "78491" })).toEqual({
      ok: true,
      value: { status: "succeeded", executionRef: "78491", reason: undefined },
    });
  });

  it("never rounds an unreadable response up to success", () => {
    // A proxy returning an HTML error page with a 200 is a real thing that
    // happens, and treating it as a success would confirm an action that never
    // occurred.
    expect(parseOutboundResult("<html>gateway timeout</html>").ok).toBe(false);
    expect(parseOutboundResult({}).ok).toBe(false);
    expect(parseOutboundResult({ status: "ok" }).ok).toBe(false);
    expect(parseOutboundResult(null).ok).toBe(false);
  });

  it("does not refuse a result over an empty optional executionRef or reason", () => {
    expect(parseOutboundResult({ status: "succeeded", executionRef: "", reason: "" })).toEqual({
      ok: true,
      value: { status: "succeeded", executionRef: undefined, reason: undefined },
    });
  });
});
