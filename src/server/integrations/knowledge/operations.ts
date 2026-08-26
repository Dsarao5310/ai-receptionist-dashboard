import "server-only";

import type { KnowledgeEntry } from "@/types";
import type { AuthContext } from "@/server/auth/policy";
import { serverEnv } from "@/server/env";
import type { KnowledgeSyncDocument, KnowledgeSyncRepository } from "@/server/db/repositories/knowledge-sync";
import { workspaceScope } from "@/server/db/workspace-scope";
import { createKnowledgeProviderClient } from "./client";
import {
  knowledgeDocumentSchema,
  knowledgeEntryInputSchema,
  knowledgeEntryPatchSchema,
  knowledgeMatchesSchema,
  knowledgeQuerySchema,
  type KnowledgeMatch,
  type KnowledgeProviderClient,
} from "./contracts";
import { KnowledgeProviderError, normalizeKnowledgeError } from "./errors";

export type KnowledgeWriteResult =
  | { state: "synced"; id: string }
  | { state: "superseded"; id: string }
  | { state: "local_only"; id: string }
  | { state: "needs_attention"; id: string; message: string };

export interface KnowledgeSyncService {
  create(entry: Omit<KnowledgeEntry, "id">, now?: Date): Promise<KnowledgeWriteResult>;
  update(id: string, patch: Partial<Omit<KnowledgeEntry, "id">>, now?: Date): Promise<KnowledgeWriteResult | null>;
  remove(id: string, now?: Date): Promise<KnowledgeWriteResult | null>;
  reconcile(now?: Date, limit?: number): Promise<KnowledgeWriteResult[]>;
  search(text: string, limit?: number): Promise<KnowledgeMatch[]>;
}

export function createKnowledgeSyncService(
  context: AuthContext,
  repository: KnowledgeSyncRepository = workspaceScope(context).knowledgeSync,
  providerFactory: () => KnowledgeProviderClient = createKnowledgeProviderClient
): KnowledgeSyncService {
  async function synchronize(document: KnowledgeSyncDocument, now: Date): Promise<KnowledgeWriteResult> {
    if (serverEnv.knowledgeProviderMode === "disabled") {
      return { state: "local_only", id: document.id };
    }

    try {
      const namespace = await repository.ensureNamespace();
      const provider = providerFactory();
      if (document.deletedAt || !document.active) {
        await provider.remove(namespace, document.providerDocumentId, document.syncVersion);
      } else {
        const payload = knowledgeDocumentSchema.parse({
          id: document.providerDocumentId,
          version: document.syncVersion,
          category: document.category,
          title: document.title,
          content: document.content,
          active: document.active,
        });
        await provider.upsert(namespace, payload);
      }
    } catch (error) {
      const normalized = normalizeKnowledgeError(error);
      const current = await repository.markFailed(
        document.id,
        document.syncVersion,
        normalized.retryable ? "error" : "sync_required",
        normalized.code,
        normalized.message
      );
      return current
        ? { state: "needs_attention", id: document.id, message: normalized.message }
        : { state: "superseded", id: document.id };
    }

    try {
      const current = await repository.markSynced(document.id, document.syncVersion, now);
      return { state: current ? "synced" : "superseded", id: document.id };
    } catch {
      const settlementFailure = new KnowledgeProviderError(
        "knowledge_settlement_failed",
        false,
        "Business Knowledge was synchronized, but confirmation needs attention."
      );
      const current = await repository.markFailed(
        document.id,
        document.syncVersion,
        "sync_required",
        settlementFailure.code,
        settlementFailure.message
      );
      return current
        ? { state: "needs_attention", id: document.id, message: settlementFailure.message }
        : { state: "superseded", id: document.id };
    }
  }

  return {
    async create(entry, now = new Date()) {
      const parsed = knowledgeEntryInputSchema.safeParse(entry);
      if (!parsed.success) {
        throw new KnowledgeProviderError("knowledge_invalid_request", false, "The Business Knowledge entry is invalid.");
      }
      return synchronize(await repository.create(parsed.data), now);
    },
    async update(id, patch, now = new Date()) {
      const parsed = knowledgeEntryPatchSchema.safeParse(patch);
      if (!parsed.success) {
        throw new KnowledgeProviderError("knowledge_invalid_request", false, "The Business Knowledge update is invalid.");
      }
      const document = await repository.prepareUpdate(id, parsed.data);
      return document ? synchronize(document, now) : null;
    },
    async remove(id, now = new Date()) {
      const document = await repository.prepareDelete(id, now);
      return document ? synchronize(document, now) : null;
    },
    async reconcile(now = new Date(), limit = 100) {
      const results: KnowledgeWriteResult[] = [];
      for (const document of await repository.pending(limit)) {
        results.push(await synchronize(document, now));
      }
      return results;
    },
    async search(text, limit = 5) {
      if (serverEnv.knowledgeProviderMode === "disabled") {
        throw new KnowledgeProviderError("knowledge_disabled", false, "Business Knowledge retrieval is not configured.");
      }
      const parsed = knowledgeQuerySchema.safeParse({ text, limit });
      if (!parsed.success) {
        throw new KnowledgeProviderError("knowledge_invalid_request", false, "The Business Knowledge search is invalid.");
      }

      try {
        const namespace = await repository.ensureNamespace();
        const matches = knowledgeMatchesSchema.parse(
          await providerFactory().search(namespace, parsed.data)
        );
        const seen = new Set<string>();
        const ranked = matches.filter((match) => {
          if (seen.has(match.id) || seen.size >= parsed.data.limit) return false;
          seen.add(match.id);
          return true;
        });
        const documents = await repository.findActiveByProviderDocumentIds(
          ranked.map((match) => match.id)
        );
        const byProviderId = new Map(
          documents.map((document) => [document.providerDocumentId, document])
        );
        return ranked.flatMap((match): KnowledgeMatch[] => {
          const document = byProviderId.get(match.id);
          return document ? [{
            id: document.id,
            title: document.title,
            content: document.content,
            score: match.score,
          }] : [];
        });
      } catch (error) {
        throw normalizeKnowledgeError(
          error,
          "Business Knowledge retrieval is temporarily unavailable."
        );
      }
    },
  };
}
