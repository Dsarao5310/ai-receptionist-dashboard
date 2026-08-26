import type { KnowledgeWriteResult } from "@/server/integrations/knowledge/operations";

export interface KnowledgeActionSuccess {
  ok: true;
  warning?: string;
}

export function projectKnowledgeWriteResult(
  result: KnowledgeWriteResult | null
): KnowledgeActionSuccess {
  return result?.state === "needs_attention"
    ? { ok: true, warning: result.message }
    : { ok: true };
}
