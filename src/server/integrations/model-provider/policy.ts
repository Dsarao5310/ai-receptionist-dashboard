import { serverEnv, type ProviderMode } from "@/server/env";
import type { ModelTask } from "./contracts";
import { ModelProviderError } from "./errors";

export const APPROVED_RECEPTIONIST_MODELS = {
  "openai/gpt-5.4-mini": { inputMicroUsdPerMillion: 750_000, outputMicroUsdPerMillion: 4_500_000 },
  "anthropic/claude-haiku-4.5": { inputMicroUsdPerMillion: 1_000_000, outputMicroUsdPerMillion: 5_000_000 },
} as const;

export type ApprovedReceptionistModel = keyof typeof APPROVED_RECEPTIONIST_MODELS;

export interface ModelPolicy {
  mode: ProviderMode;
  primaryModel: ApprovedReceptionistModel;
  fallbackModel: ApprovedReceptionistModel;
  timeoutMs: number;
  maxRetries: 1;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxCostMicroUsd: number;
}

const PROMPT_AND_SCHEMA_OVERHEAD_TOKENS = 512;

function approvedModel(value: string | undefined, fallback: ApprovedReceptionistModel): ApprovedReceptionistModel {
  if (!value) return fallback;
  if (value in APPROVED_RECEPTIONIST_MODELS) return value as ApprovedReceptionistModel;
  throw new ModelProviderError("model_not_configured", false, "The configured model is not approved for receptionist use.");
}

export function resolveModelPolicy(): ModelPolicy {
  const mode = serverEnv.modelProviderMode;
  if (mode === "live" && (!serverEnv.modelPrimaryId || !serverEnv.modelFallbackId)) {
    throw new ModelProviderError("model_not_configured", false, "Live mode requires explicit primary and fallback models.");
  }
  const primaryModel = approvedModel(serverEnv.modelPrimaryId, "openai/gpt-5.4-mini");
  const fallbackModel = approvedModel(serverEnv.modelFallbackId, "anthropic/claude-haiku-4.5");
  if (primaryModel === fallbackModel) {
    throw new ModelProviderError("model_not_configured", false, "The primary and fallback models must be different.");
  }
  return {
    mode,
    primaryModel,
    fallbackModel,
    timeoutMs: serverEnv.modelTimeoutMs,
    maxRetries: 1,
    maxInputTokens: serverEnv.modelMaxInputTokens,
    maxOutputTokens: serverEnv.modelMaxOutputTokens,
    maxCostMicroUsd: serverEnv.modelMaxCostMicroUsd,
  };
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export function serializeTask(task: ModelTask): string {
  return JSON.stringify(task.request);
}

export function estimateMaximumCostMicroUsd(policy: ModelPolicy, inputTokens: number): number {
  const rates = [policy.primaryModel, policy.fallbackModel].map((model) => APPROVED_RECEPTIONIST_MODELS[model]);
  const singleAttempt = Math.max(...rates.map((rate) => Math.ceil(
    (inputTokens * rate.inputMicroUsdPerMillion + policy.maxOutputTokens * rate.outputMicroUsdPerMillion) / 1_000_000
  )));
  return singleAttempt * (policy.maxRetries + 1);
}

export function enforceModelBudget(policy: ModelPolicy, task: ModelTask): number {
  const inputTokens = estimateTokens(serializeTask(task)) + PROMPT_AND_SCHEMA_OVERHEAD_TOKENS;
  if (inputTokens > policy.maxInputTokens) {
    throw new ModelProviderError("model_input_budget_exceeded", false, "The request is too large for the receptionist model.");
  }
  if (estimateMaximumCostMicroUsd(policy, inputTokens) > policy.maxCostMicroUsd) {
    throw new ModelProviderError("model_cost_budget_exceeded", false, "The request exceeds the configured model cost ceiling.");
  }
  return inputTokens;
}

export function conservativeActualCostMicroUsd(
  policy: ModelPolicy,
  inputTokens: number,
  outputTokens: number
): number {
  return Math.max(...[policy.primaryModel, policy.fallbackModel].map((model) => {
    const rate = APPROVED_RECEPTIONIST_MODELS[model];
    return Math.ceil(
      (inputTokens * rate.inputMicroUsdPerMillion + outputTokens * rate.outputMicroUsdPerMillion) / 1_000_000
    );
  }));
}
