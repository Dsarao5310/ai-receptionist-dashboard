import "server-only";

import { serverEnv } from "@/server/env";
import {
  callAnalysisRequestSchema,
  modelExecutionContextSchema,
  receptionistReplyRequestSchema,
  type CallAnalysis,
  type CallAnalysisRequest,
  type ModelExecutionContext,
  type ModelResult,
  type ReceptionistReply,
  type ReceptionistReplyRequest,
} from "./contracts";
import { ModelProviderError } from "./errors";
import { gatewayModelExecutor, type LiveModelExecutor } from "./gateway";
import { enforceModelBudget, resolveModelPolicy } from "./policy";
import { simulateAnalysis, simulateReply } from "./simulator";

export interface ReceptionistModelProvider {
  reply(context: ModelExecutionContext, request: ReceptionistReplyRequest): Promise<ModelResult<ReceptionistReply>>;
  analyzeCall(context: ModelExecutionContext, request: CallAnalysisRequest): Promise<ModelResult<CallAnalysis>>;
}

function validate<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ModelProviderError("model_invalid_request", false, "The model request is invalid.");
  return result.data;
}

export function createReceptionistModelProvider(live: LiveModelExecutor = gatewayModelExecutor): ReceptionistModelProvider {
  return {
    async reply(contextInput, requestInput) {
      const context = validate(modelExecutionContextSchema, contextInput);
      const request = validate(receptionistReplyRequestSchema, requestInput);
      const policy = resolveModelPolicy();
      enforceModelBudget(policy, { kind: "receptionist_reply", request });
      if (policy.mode === "disabled") throw new ModelProviderError("model_disabled", false, "The receptionist model is disabled.");
      if (policy.mode === "simulated") return simulateReply(request);
      if (!serverEnv.modelGatewayAuthConfigured) {
        throw new ModelProviderError("model_not_configured", false, "The receptionist model is not configured.");
      }
      return live.reply(context, request, policy);
    },

    async analyzeCall(contextInput, requestInput) {
      const context = validate(modelExecutionContextSchema, contextInput);
      const request = validate(callAnalysisRequestSchema, requestInput);
      const policy = resolveModelPolicy();
      enforceModelBudget(policy, { kind: "call_analysis", request });
      if (policy.mode === "disabled") throw new ModelProviderError("model_disabled", false, "The receptionist model is disabled.");
      if (policy.mode === "simulated") return simulateAnalysis(request);
      if (!serverEnv.modelGatewayAuthConfigured) {
        throw new ModelProviderError("model_not_configured", false, "The receptionist model is not configured.");
      }
      return live.analyze(context, request, policy);
    },
  };
}

export const receptionistModelProvider = createReceptionistModelProvider();
export { ModelProviderError } from "./errors";
export type {
  CallAnalysis,
  CallAnalysisRequest,
  ModelExecutionContext,
  ModelResult,
  ReceptionistReply,
  ReceptionistReplyRequest,
} from "./contracts";
