import { describe, expect, it, vi } from "vitest";
import { Errors as PineconeErrors, type Index } from "@pinecone-database/pinecone";
import type { KnowledgeDocument } from "./contracts";
import { KnowledgeProviderError } from "./errors";
import { PineconeKnowledgeProvider, type PineconeRecordFields } from "./pinecone";

vi.mock("server-only", () => ({}));

const DOCUMENT: KnowledgeDocument = {
  id: "doc_1",
  version: 3,
  category: "faq",
  title: "Parking",
  content: "Free parking is available behind the building.",
  active: true,
};

function fakeIndex(overrides: {
  upsertRecords?: ReturnType<typeof vi.fn>;
  deleteOne?: ReturnType<typeof vi.fn>;
  searchRecords?: ReturnType<typeof vi.fn>;
}) {
  const namespaced = {
    upsertRecords: overrides.upsertRecords ?? vi.fn(),
    deleteOne: overrides.deleteOne ?? vi.fn(),
    searchRecords: overrides.searchRecords ?? vi.fn(),
  };
  const namespaceFn = vi.fn(() => namespaced);
  return {
    index: { namespace: namespaceFn } as unknown as Index<PineconeRecordFields>,
    namespaced,
    namespaceFn,
  };
}

describe("PineconeKnowledgeProvider.upsert", () => {
  it("targets the given namespace and embeds title+content into the configured text field", async () => {
    const upsertRecords = vi.fn().mockResolvedValue(undefined);
    const { index, namespaceFn } = fakeIndex({ upsertRecords });
    const provider = new PineconeKnowledgeProvider(index);

    await provider.upsert("ws_ns_1", DOCUMENT);

    expect(namespaceFn).toHaveBeenCalledWith("ws_ns_1");
    expect(upsertRecords).toHaveBeenCalledWith({
      records: [
        {
          id: "doc_1",
          content: "Parking\n\nFree parking is available behind the building.",
          title: "Parking",
          category: "faq",
          active: true,
          version: 3,
        },
      ],
    });
  });

  it("normalizes an authorization failure as non-retryable without leaking SDK detail", async () => {
    const upsertRecords = vi.fn().mockRejectedValue(
      new PineconeErrors.PineconeAuthorizationError({ status: 401 })
    );
    const { index } = fakeIndex({ upsertRecords });
    const provider = new PineconeKnowledgeProvider(index);

    await expect(provider.upsert("ws_ns_1", DOCUMENT)).rejects.toMatchObject({
      code: "knowledge_provider_failed",
      retryable: false,
    });
  });

  it("normalizes a connection failure as retryable", async () => {
    const upsertRecords = vi.fn().mockRejectedValue(new PineconeErrors.PineconeConnectionError(new Error("fetch failed")));
    const { index } = fakeIndex({ upsertRecords });
    const provider = new PineconeKnowledgeProvider(index);

    await expect(provider.upsert("ws_ns_1", DOCUMENT)).rejects.toMatchObject({
      code: "knowledge_provider_failed",
      retryable: true,
    });
  });

  it("normalizes a malformed-argument failure as an invalid-request error", async () => {
    const upsertRecords = vi.fn().mockRejectedValue(new PineconeErrors.PineconeArgumentError("bad id"));
    const { index } = fakeIndex({ upsertRecords });
    const provider = new PineconeKnowledgeProvider(index);

    await expect(provider.upsert("ws_ns_1", DOCUMENT)).rejects.toBeInstanceOf(KnowledgeProviderError);
    await expect(provider.upsert("ws_ns_1", DOCUMENT)).rejects.toMatchObject({
      code: "knowledge_invalid_request",
      retryable: false,
    });
  });
});

describe("PineconeKnowledgeProvider.remove", () => {
  it("deletes by id in the given namespace", async () => {
    const deleteOne = vi.fn().mockResolvedValue(undefined);
    const { index, namespaceFn } = fakeIndex({ deleteOne });
    const provider = new PineconeKnowledgeProvider(index);

    await provider.remove("ws_ns_1", "doc_1", 3);

    expect(namespaceFn).toHaveBeenCalledWith("ws_ns_1");
    expect(deleteOne).toHaveBeenCalledWith({ id: "doc_1" });
  });

  it("treats a not-found response as success, not a failure", async () => {
    const deleteOne = vi.fn().mockRejectedValue(new PineconeErrors.PineconeNotFoundError({ status: 404 }));
    const { index } = fakeIndex({ deleteOne });
    const provider = new PineconeKnowledgeProvider(index);

    await expect(provider.remove("ws_ns_1", "doc_1", 3)).resolves.toBeUndefined();
  });
});

describe("PineconeKnowledgeProvider.search", () => {
  it("queries by text with the requested limit and maps hits to KnowledgeMatch", async () => {
    const searchRecords = vi.fn().mockResolvedValue({
      result: {
        hits: [
          { _id: "doc_1", _score: 0.91, fields: { title: "Parking", content: "Free parking..." } },
          { _id: "doc_2", _score: 0.4, fields: { title: "Hours", content: "We open at 9am." } },
        ],
      },
      usage: { readUnits: 1, embedTotalTokens: 4 },
    });
    const { index, namespaceFn } = fakeIndex({ searchRecords });
    const provider = new PineconeKnowledgeProvider(index);

    const matches = await provider.search("ws_ns_1", { text: "parking", limit: 5 });

    expect(namespaceFn).toHaveBeenCalledWith("ws_ns_1");
    expect(searchRecords).toHaveBeenCalledWith({
      query: { topK: 5, inputs: { text: "parking" } },
      fields: ["title", "content"],
    });
    expect(matches).toEqual([
      { id: "doc_1", title: "Parking", content: "Free parking...", score: 0.91 },
      { id: "doc_2", title: "Hours", content: "We open at 9am.", score: 0.4 },
    ]);
  });

  it("defaults a non-string field to an empty string rather than throwing", async () => {
    const searchRecords = vi.fn().mockResolvedValue({
      result: { hits: [{ _id: "doc_1", _score: 0.5, fields: {} }] },
      usage: { readUnits: 1 },
    });
    const { index } = fakeIndex({ searchRecords });
    const provider = new PineconeKnowledgeProvider(index);

    const matches = await provider.search("ws_ns_1", { text: "parking", limit: 5 });

    expect(matches).toEqual([{ id: "doc_1", title: "", content: "", score: 0.5 }]);
  });

  it("normalizes a provider failure during search", async () => {
    const searchRecords = vi.fn().mockRejectedValue(new PineconeErrors.PineconeConnectionError(new Error("fetch failed")));
    const { index } = fakeIndex({ searchRecords });
    const provider = new PineconeKnowledgeProvider(index);

    await expect(provider.search("ws_ns_1", { text: "parking", limit: 5 })).rejects.toMatchObject({
      code: "knowledge_provider_failed",
      retryable: true,
    });
  });
});
