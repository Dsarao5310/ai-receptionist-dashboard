import "server-only";

import { Errors as PineconeErrors, Pinecone, type Index } from "@pinecone-database/pinecone";
import type { Secret } from "@/server/integrations/credential-store";
import type { KnowledgeDocument, KnowledgeMatch, KnowledgeProviderClient, KnowledgeQuery } from "./contracts";
import { KnowledgeProviderError } from "./errors";

/**
 * The live Pinecone-backed provider.
 *
 * ── Not wired up ─────────────────────────────────────────────────────────
 * `client.ts` never constructs this class. Its "live" branch is a
 * deliberate, unconditional fail-closed throw — "until a separately
 * approved Pinecone account, index policy, embedding model, and
 * data-handling review exist" — and `production-config.ts` rejects
 * `KNOWLEDGE_PROVIDER_MODE=live` outright, in every environment it
 * validates. Both are policy checkpoints, not technical gaps, and neither
 * is this file's to remove. This class exists so that decision, once made,
 * is a one-line change in `client.ts` rather than a new implementation
 * written under pressure.
 *
 * ── One index, one text field, per-workspace namespaces ─────────────────
 * Integrated inference (Pinecone embeds on upsert/search) means no
 * separate embedding provider or API key. Every record's text lives in the
 * `content` field, matching whatever index this app points at — that index
 * must be created with `fieldMap: { text: "content" }`, or every write
 * fails immediately with a clear provider error, not a silent mismatch.
 * The namespace argument is never invented here: it is the server-issued
 * value already produced by the existing per-workspace namespace mapping
 * (migration 18), so tenant isolation is inherited rather than re-decided.
 *
 * ── Deletion is idempotent ────────────────────────────────────────────────
 * A 404 from Pinecone on delete means the same thing as success: the
 * record is not there. Surfacing it as a failure would turn a redundant
 * reconciliation pass into a spurious `needs_attention` state.
 */

const TEXT_FIELD = "content";

export interface PineconeRecordFields extends Record<string, string | boolean | number> {
  content: string;
  title: string;
  category: string;
  active: boolean;
  version: number;
}

function toRecord(document: KnowledgeDocument): { id: string } & PineconeRecordFields {
  return {
    id: document.id,
    [TEXT_FIELD]: `${document.title}\n\n${document.content}`,
    title: document.title,
    category: document.category,
    active: document.active,
    version: document.version,
  };
}

function stringField(fields: object, key: string): string {
  const value = (fields as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

/**
 * Every raw Pinecone failure becomes one of the two categories the rest of
 * the sync pipeline already understands: retryable (network/availability —
 * try again later) or not (bad credential, malformed request — retrying
 * changes nothing). No SDK class name, status code, or request id crosses
 * this boundary; `normalizeKnowledgeError` downstream also strips detail,
 * but starting clean here means a future call site can't accidentally skip
 * that normalization.
 */
function normalizePineconeError(error: unknown): KnowledgeProviderError {
  if (error instanceof KnowledgeProviderError) return error;
  if (error instanceof PineconeErrors.PineconeAuthorizationError) {
    return new KnowledgeProviderError(
      "knowledge_provider_failed",
      false,
      "The knowledge provider rejected its server credential."
    );
  }
  if (error instanceof PineconeErrors.PineconeArgumentError) {
    return new KnowledgeProviderError(
      "knowledge_invalid_request",
      false,
      "The knowledge request was rejected as malformed."
    );
  }
  if (
    error instanceof PineconeErrors.PineconeConnectionError ||
    error instanceof PineconeErrors.PineconeTimeoutError ||
    error instanceof PineconeErrors.PineconeUnavailableError ||
    error instanceof PineconeErrors.PineconeMaxRetriesExceededError
  ) {
    return new KnowledgeProviderError(
      "knowledge_provider_failed",
      true,
      "The knowledge provider is temporarily unavailable."
    );
  }
  return new KnowledgeProviderError(
    "knowledge_provider_failed",
    true,
    "Business Knowledge was saved, but provider synchronization needs attention."
  );
}

export class PineconeKnowledgeProvider implements KnowledgeProviderClient {
  constructor(private readonly index: Index<PineconeRecordFields>) {}

  async upsert(namespace: string, document: KnowledgeDocument): Promise<void> {
    try {
      await this.index.namespace(namespace).upsertRecords({ records: [toRecord(document)] });
    } catch (error) {
      throw normalizePineconeError(error);
    }
  }

  /**
   * `version` is accepted only to satisfy `KnowledgeProviderClient` — the
   * calling service already serializes writes per document through the
   * repository's own optimistic-concurrency check before this method is
   * ever invoked, so a second, provider-side ordering guard here would be
   * redundant rather than protective.
   */
  async remove(namespace: string, documentId: string, _version: number): Promise<void> {
    void _version;
    try {
      await this.index.namespace(namespace).deleteOne({ id: documentId });
    } catch (error) {
      if (error instanceof PineconeErrors.PineconeNotFoundError) return;
      throw normalizePineconeError(error);
    }
  }

  async search(namespace: string, query: KnowledgeQuery): Promise<KnowledgeMatch[]> {
    try {
      const response = await this.index.namespace(namespace).searchRecords({
        query: { topK: query.limit, inputs: { text: query.text } },
        fields: ["title", TEXT_FIELD],
      });
      return response.result.hits.map((hit) => ({
        id: hit._id,
        title: stringField(hit.fields, "title"),
        content: stringField(hit.fields, TEXT_FIELD),
        score: hit._score,
      }));
    } catch (error) {
      throw normalizePineconeError(error);
    }
  }
}

/**
 * Construct a live provider from resolved server configuration.
 *
 * Takes the already-resolved credential and host rather than reading
 * `serverEnv`/`credentialStore` itself, so a caller's "is this configured"
 * check and the value actually used can never drift apart — the same
 * problem `Secret` exists to prevent for logging, applied to configuration
 * instead.
 */
export function createPineconeKnowledgeProvider(apiKey: Secret, indexHost: string): PineconeKnowledgeProvider {
  const pc = new Pinecone({ apiKey: apiKey.expose() });
  return new PineconeKnowledgeProvider(pc.index<PineconeRecordFields>({ host: indexHost }));
}
