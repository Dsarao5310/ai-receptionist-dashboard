export class KnowledgeProviderError extends Error {
  constructor(
    readonly code: "knowledge_disabled" | "knowledge_invalid_request" | "knowledge_live_unavailable" | "knowledge_provider_failed" | "knowledge_settlement_failed",
    readonly retryable: boolean,
    message: string
  ) {
    super(message);
    this.name = "KnowledgeProviderError";
  }
}

export function normalizeKnowledgeError(
  error: unknown,
  safeMessage = "Business Knowledge was saved, but provider synchronization needs attention."
): KnowledgeProviderError {
  if (error instanceof KnowledgeProviderError) return error;
  return new KnowledgeProviderError(
    "knowledge_provider_failed",
    true,
    safeMessage
  );
}
