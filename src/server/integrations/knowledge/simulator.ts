import type {
  KnowledgeDocument,
  KnowledgeMatch,
  KnowledgeProviderClient,
  KnowledgeQuery,
} from "./contracts";

function terms(value: string): Set<string> {
  return new Set(value.toLowerCase().match(/[a-z0-9]+/g) ?? []);
}

class SimulatedKnowledgeProvider implements KnowledgeProviderClient {
  private readonly namespaces = new Map<string, Map<string, KnowledgeDocument>>();
  private readonly versions = new Map<string, Map<string, number>>();

  async upsert(namespace: string, document: KnowledgeDocument): Promise<void> {
    const documents = this.namespaces.get(namespace) ?? new Map<string, KnowledgeDocument>();
    const versions = this.versions.get(namespace) ?? new Map<string, number>();
    if ((versions.get(document.id) ?? -1) > document.version) return;
    documents.set(document.id, structuredClone(document));
    versions.set(document.id, document.version);
    this.namespaces.set(namespace, documents);
    this.versions.set(namespace, versions);
  }

  async remove(namespace: string, documentId: string, version: number): Promise<void> {
    const documents = this.namespaces.get(namespace) ?? new Map<string, KnowledgeDocument>();
    const versions = this.versions.get(namespace) ?? new Map<string, number>();
    if ((versions.get(documentId) ?? -1) > version) return;
    documents.delete(documentId);
    versions.set(documentId, version);
    this.namespaces.set(namespace, documents);
    this.versions.set(namespace, versions);
  }

  async search(namespace: string, query: KnowledgeQuery): Promise<KnowledgeMatch[]> {
    const queryTerms = terms(query.text);
    if (queryTerms.size === 0) return [];

    return [...(this.namespaces.get(namespace)?.values() ?? [])]
      .filter((document) => document.active)
      .map((document) => {
        const documentTerms = terms(`${document.title} ${document.content}`);
        const overlap = [...queryTerms].filter((term) => documentTerms.has(term)).length;
        return {
          id: document.id,
          title: document.title,
          content: document.content,
          score: overlap / queryTerms.size,
        };
      })
      .filter((match) => match.score > 0)
      .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
      .slice(0, query.limit);
  }

  reset(): void {
    this.namespaces.clear();
    this.versions.clear();
  }
}

export const simulatedKnowledgeProvider = new SimulatedKnowledgeProvider();
