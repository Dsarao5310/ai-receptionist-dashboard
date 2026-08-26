import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APICallError, NoObjectGeneratedError } from "ai";
import type { IntegrationRecord } from "@/types";
import { MODEL_EVAL_FIXTURES } from "./eval-fixtures";
import { ModelProviderError } from "./errors";
import { createReceptionistModelProvider } from "./index";
import { modelProviderServerAdapter } from "./adapter";
import { normalizedGatewayError } from "./gateway";
import { estimateMaximumCostMicroUsd, resolveModelPolicy } from "./policy";

vi.mock("server-only", () => ({}));

const ORIGINAL_ENV = { ...process.env };
const context = { workspaceId: "ws_coastal", invocationId: "invocation_1", source: "trusted_vapi" as const };
const business = {
  name: "Coastal Bloom Salon",
  timezone: "America/Vancouver",
  services: ["Haircut"],
  policies: ["A request is not a confirmed booking."],
};

function record(): IntegrationRecord {
  return {
    id: "integration_model",
    workspaceId: context.workspaceId,
    type: "model",
    provider: "model_provider",
    displayName: "Language model",
    purpose: "Compose receptionist replies",
    connection: "connected",
    health: "healthy",
    lastCheckedAt: null,
    lastSuccessfulSyncAt: null,
    capabilities: [
      { key: "chat", label: "Compose replies", enabled: true },
      { key: "summarise", label: "Summarise conversations", enabled: true },
    ],
    config: [],
    admin: { environment: "sandbox" },
    lastError: null,
  };
}

beforeEach(() => {
  process.env.MODEL_PROVIDER_MODE = "simulated";
  process.env.MODEL_PRIMARY_ID = "openai/gpt-5.4-mini";
  process.env.MODEL_FALLBACK_ID = "anthropic/claude-haiku-4.5";
  delete process.env.AI_GATEWAY_API_KEY;
  delete process.env.VERCEL_OIDC_TOKEN;
  delete process.env.MODEL_MAX_COST_MICRO_USD;
  delete process.env.MODEL_MAX_INPUT_TOKENS;
  delete process.env.MODEL_MAX_OUTPUT_TOKENS;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("model-provider foundation", () => {
  it.each(MODEL_EVAL_FIXTURES)("passes deterministic evaluation: $name", async (fixture) => {
    const result = await createReceptionistModelProvider().reply(context, fixture.request);
    expect(result.simulated).toBe(true);
    expect(result.value).toMatchObject({ action: fixture.expectedAction, reason: fixture.expectedReason });
    expect(result.usage.estimatedCostMicroUsd).toBe(0);
  });

  it("analyses booking intent without claiming a confirmed appointment", async () => {
    const result = await createReceptionistModelProvider().analyzeCall(context, {
      businessName: business.name,
      transcript: [{ role: "customer", text: "Can I book a haircut tomorrow?" }],
    });
    expect(result.value).toMatchObject({ outcome: "booking_requested", followUpRequired: true });
    expect(result.value.summary).toContain("no booking confirmation");
  });

  it("rejects malformed and oversized input before an executor can run", async () => {
    const reply = vi.fn();
    const provider = createReceptionistModelProvider({ reply, analyze: vi.fn() });
    await expect(provider.reply(context, { business, messages: [] })).rejects.toMatchObject({ code: "model_invalid_request" });
    await expect(provider.reply(context, {
      business,
      messages: [{ role: "customer", text: "x".repeat(4_001) }],
    })).rejects.toMatchObject({ code: "model_invalid_request" });
    expect(reply).not.toHaveBeenCalled();
  });

  it("enforces the preflight cost ceiling before generation", async () => {
    process.env.MODEL_MAX_COST_MICRO_USD = "1000";
    const provider = createReceptionistModelProvider();
    await expect(provider.reply(context, {
      business,
      messages: [{ role: "customer", text: "What services do you offer?" }],
    })).rejects.toMatchObject({ code: "model_cost_budget_exceeded" });
  });

  it("uses a conservative cross-model cost estimate", () => {
    const policy = resolveModelPolicy();
    expect(estimateMaximumCostMicroUsd(policy, 6_000)).toBe(15_500);
  });

  it("fails closed when disabled or live authentication is absent", async () => {
    const request = { business, messages: [{ role: "customer" as const, text: "Hello" }] };
    process.env.MODEL_PROVIDER_MODE = "disabled";
    await expect(createReceptionistModelProvider().reply(context, request)).rejects.toMatchObject({ code: "model_disabled" });

    process.env.MODEL_PROVIDER_MODE = "live";
    await expect(createReceptionistModelProvider().reply(context, request)).rejects.toMatchObject({ code: "model_not_configured" });
  });

  it("passes only validated server context and bounded policy to the live executor", async () => {
    process.env.MODEL_PROVIDER_MODE = "live";
    process.env.AI_GATEWAY_API_KEY = "server-only-test-key";
    const reply = vi.fn().mockResolvedValue({
      value: { text: "Hello", action: "respond", reason: "answer" },
      simulated: false,
      usage: { inputTokens: 10, outputTokens: 2, estimatedCostMicroUsd: 1 },
    });
    const provider = createReceptionistModelProvider({ reply, analyze: vi.fn() });
    await provider.reply(context, { business, messages: [{ role: "customer", text: "Hello" }] });
    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply.mock.calls[0][0]).toEqual(context);
    expect(reply.mock.calls[0][2]).toMatchObject({ maxRetries: 1, timeoutMs: 8_000, maxOutputTokens: 350 });
  });

  it("rejects unapproved or duplicate model policy", () => {
    process.env.MODEL_PRIMARY_ID = "other/unknown";
    expect(() => resolveModelPolicy()).toThrow(ModelProviderError);
    process.env.MODEL_PRIMARY_ID = "anthropic/claude-haiku-4.5";
    expect(() => resolveModelPolicy()).toThrowError(/primary and fallback/i);
  });

  it("projects safe adapter state without making a live model request", async () => {
    const ctx = { record: record(), now: new Date("2026-08-24T20:00:00.000Z") };
    const test = await modelProviderServerAdapter.testConnection(ctx);
    expect(test).toMatchObject({ outcome: "healthy", health: "healthy" });
    expect(test.message).toContain("simulated");

    process.env.MODEL_PROVIDER_MODE = "disabled";
    const disabled = await modelProviderServerAdapter.connect(ctx);
    expect(disabled).toMatchObject({ connection: "not_configured", health: "unknown" });
    expect(disabled.capabilities?.every((capability) => !capability.enabled)).toBe(true);
  });

  it("normalizes provider failures without leaking raw bodies or credentials", () => {
    const invalidOutput = normalizedGatewayError(new NoObjectGeneratedError({
      text: "malformed output containing sk-secret",
      response: { id: "response_1", timestamp: new Date("2026-08-26T00:00:00.000Z"), modelId: "private-model" },
      usage: {
        inputTokens: 10,
        inputTokenDetails: { noCacheTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
        outputTokens: 2,
        outputTokenDetails: { textTokens: 2, reasoningTokens: 0 },
        totalTokens: 12,
      },
      finishReason: "stop",
    }));
    expect(invalidOutput).toMatchObject({ code: "model_invalid_response", retryable: true });
    expect(JSON.stringify(invalidOutput)).not.toContain("sk-secret");
    expect(JSON.stringify(invalidOutput)).not.toContain("private-model");

    const auth = normalizedGatewayError(new APICallError({
      message: "credential sk-secret rejected",
      url: "https://gateway.example/private",
      requestBodyValues: { prompt: "customer data" },
      statusCode: 401,
      responseBody: "raw upstream body",
    }));
    expect(auth).toMatchObject({ code: "model_authentication_failed", retryable: false });
    expect(JSON.stringify(auth)).not.toContain("sk-secret");
    expect(JSON.stringify(auth)).not.toContain("raw upstream body");

    const limited = normalizedGatewayError(new APICallError({
      message: "limited",
      url: "https://gateway.example",
      requestBodyValues: {},
      statusCode: 429,
    }));
    expect(limited).toMatchObject({ code: "model_rate_limited", retryable: true });
    expect(normalizedGatewayError(new DOMException("late", "TimeoutError"))).toMatchObject({
      code: "model_timeout",
      retryable: true,
    });
  });
});
