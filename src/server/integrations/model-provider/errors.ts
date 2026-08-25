export type ModelErrorCode =
  | "model_disabled"
  | "model_not_configured"
  | "model_invalid_request"
  | "model_input_budget_exceeded"
  | "model_cost_budget_exceeded"
  | "model_authentication_failed"
  | "model_rate_limited"
  | "model_provider_unavailable"
  | "model_timeout"
  | "model_invalid_response";

/** Safe, provider-neutral failure. Raw SDK/provider errors never leave the boundary. */
export class ModelProviderError extends Error {
  constructor(
    readonly code: ModelErrorCode,
    readonly retryable: boolean,
    message: string
  ) {
    super(message);
    this.name = "ModelProviderError";
  }
}
