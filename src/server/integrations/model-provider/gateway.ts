import "server-only";

import { APICallError, generateText, gateway, NoOutputGeneratedError, Output, type GatewayModelId } from "ai";
import type { ZodType } from "zod";
import type {
  CallAnalysis,
  CallAnalysisRequest,
  ModelExecutionContext,
  ModelResult,
  ReceptionistReply,
  ReceptionistReplyRequest,
} from "./contracts";
import { callAnalysisSchema, receptionistReplySchema } from "./contracts";
import { ModelProviderError } from "./errors";
import { conservativeActualCostMicroUsd, type ModelPolicy } from "./policy";
import { analysisPrompt, RECEPTIONIST_PROMPT_VERSION, replyPrompt } from "./prompts";

export function normalizedGatewayError(error: unknown): ModelProviderError {
  if (error instanceof ModelProviderError) return error;
  if (NoOutputGeneratedError.isInstance(error)) {
    return new ModelProviderError("model_invalid_response", true, "The model returned an invalid response.");
  }
  if (APICallError.isInstance(error)) {
    if (error.statusCode === 401 || error.statusCode === 403) {
      return new ModelProviderError("model_authentication_failed", false, "The model provider rejected its server credential.");
    }
    if (error.statusCode === 402) {
      return new ModelProviderError("model_cost_budget_exceeded", false, "The model provider budget is unavailable.");
    }
    if (error.statusCode === 429) {
      return new ModelProviderError("model_rate_limited", true, "The model provider is temporarily rate limited.");
    }
    return new ModelProviderError("model_provider_unavailable", true, "The model provider is temporarily unavailable.");
  }
  if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")) {
    return new ModelProviderError("model_timeout", true, "The model provider did not respond in time.");
  }
  return new ModelProviderError("model_provider_unavailable", true, "The model provider is temporarily unavailable.");
}

async function generateStructured<T>(options: {
  context: ModelExecutionContext;
  policy: ModelPolicy;
  schema: ZodType<T>;
  system: string;
  prompt: string;
}): Promise<ModelResult<T>> {
  try {
    const result = await generateText({
      model: gateway(options.policy.primaryModel as GatewayModelId),
      output: Output.object({ schema: options.schema }),
      system: options.system,
      prompt: options.prompt,
      maxOutputTokens: options.policy.maxOutputTokens,
      maxRetries: options.policy.maxRetries,
      timeout: options.policy.timeoutMs,
      providerOptions: {
        gateway: {
          models: [options.policy.fallbackModel],
          user: options.context.workspaceId,
          tags: ["feature:receptionist", `prompt:${RECEPTIONIST_PROMPT_VERSION}`],
          zeroDataRetention: true,
          disallowPromptTraining: true,
        },
      },
    });
    const inputTokens = result.totalUsage.inputTokens ?? 0;
    const outputTokens = result.totalUsage.outputTokens ?? 0;
    const value = options.schema.parse(result.output) as T;
    return {
      value,
      simulated: false,
      usage: {
        inputTokens,
        outputTokens,
        estimatedCostMicroUsd: conservativeActualCostMicroUsd(options.policy, inputTokens, outputTokens),
      },
    };
  } catch (error) {
    throw normalizedGatewayError(error);
  }
}

export interface LiveModelExecutor {
  reply(context: ModelExecutionContext, request: ReceptionistReplyRequest, policy: ModelPolicy): Promise<ModelResult<ReceptionistReply>>;
  analyze(context: ModelExecutionContext, request: CallAnalysisRequest, policy: ModelPolicy): Promise<ModelResult<CallAnalysis>>;
}

export const gatewayModelExecutor: LiveModelExecutor = {
  reply(context, request, policy) {
    return generateStructured<ReceptionistReply>({ context, policy, schema: receptionistReplySchema, ...replyPrompt(request) });
  },
  analyze(context, request, policy) {
    return generateStructured<CallAnalysis>({ context, policy, schema: callAnalysisSchema, ...analysisPrompt(request) });
  },
};
