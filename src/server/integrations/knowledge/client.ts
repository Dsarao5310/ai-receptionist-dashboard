import "server-only";

import { serverEnv } from "@/server/env";
import { credentialStore } from "@/server/integrations/credential-store";
import type { KnowledgeProviderClient } from "./contracts";
import { KnowledgeProviderError } from "./errors";
import { createPineconeKnowledgeProvider } from "./pinecone";
import { simulatedKnowledgeProvider } from "./simulator";

/**
 * Live mode requires an explicit `KNOWLEDGE_PROVIDER_MODE=live` (never a
 * default anywhere — see `serverEnv.knowledgeProviderMode`) *and* both
 * `PINECONE_API_KEY` and `PINECONE_INDEX_HOST` actually configured. No
 * environment gets those by default; `production-config.ts` additionally
 * restricts live providers in Preview to the `staging` branch. Production
 * stays fail-closed in practice because no production Pinecone credential
 * exists yet, not because of a special case here — the same gate every
 * other provider (Vapi, Twilio, the model provider) already uses.
 */
export function createKnowledgeProviderClient(): KnowledgeProviderClient {
  if (serverEnv.knowledgeProviderMode === "disabled") {
    throw new KnowledgeProviderError("knowledge_disabled", false, "Business Knowledge retrieval is not configured.");
  }
  if (serverEnv.knowledgeProviderMode === "simulated") return simulatedKnowledgeProvider;

  const apiKey = credentialStore.resolve("pinecone", "api_key");
  const indexHost = serverEnv.pineconeIndexHost;
  if (!apiKey || !indexHost) {
    throw new KnowledgeProviderError(
      "knowledge_live_unavailable",
      false,
      "Live Business Knowledge retrieval is not configured."
    );
  }
  return createPineconeKnowledgeProvider(apiKey, indexHost);
}
