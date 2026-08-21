import { createMockAdapter } from "./core";

/**
 * Knowledge retrieval. Business users never see this name — it sits behind the
 * "Business Knowledge" capability.
 */
export const pineconeAdapter = createMockAdapter({
  provider: "pinecone",
  timeStyle: { kind: "utc" },
  requiredConfig: ["index", "namespace", "api_key"],
  capabilitiesWhenConnected: ["search", "reindex"],
});
