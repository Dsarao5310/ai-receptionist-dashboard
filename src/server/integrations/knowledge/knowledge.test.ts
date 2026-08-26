import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/types/identity";
import { DEV_WORKSPACE_A, DEV_WORKSPACE_B } from "@/data/workspace-ids";
import { authorizeWorkspace, type AuthContext } from "@/server/auth/policy";
import type { Sql } from "@/server/db/client";
import { PostgresIdentityRepository } from "@/server/db/identity";
import { workspaceScope } from "@/server/db/workspace-scope";
import type { KnowledgeSyncRepository } from "@/server/db/repositories/knowledge-sync";
import { hasDatabase, resetTestDatabase, testDb } from "@/test/database";
import type { IntegrationRecord } from "@/types";
import { knowledgeProviderServerAdapter } from "./adapter";
import type { KnowledgeProviderClient } from "./contracts";
import { createKnowledgeSyncService } from "./operations";
import { KnowledgeProviderError } from "./errors";
import { simulatedKnowledgeProvider } from "./simulator";

vi.mock("server-only", () => ({}));

const NOW = new Date("2026-08-25T20:00:00.000Z");
const describeDb = hasDatabase ? describe : describe.skip;
const originalMode = process.env.KNOWLEDGE_PROVIDER_MODE;
let sql: Sql;
let identity: PostgresIdentityRepository;

afterAll(async () => {
  if (originalMode === undefined) delete process.env.KNOWLEDGE_PROVIDER_MODE;
  else process.env.KNOWLEDGE_PROVIDER_MODE = originalMode;
});

beforeEach(() => {
  process.env.KNOWLEDGE_PROVIDER_MODE = "simulated";
  simulatedKnowledgeProvider.reset();
});

async function context(email: string, workspaceId: string): Promise<AuthContext> {
  const user = await identity.findUserByEmail(email);
  if (!user) throw new Error(`fixture missing: ${email}`);
  return authorizeWorkspace(user as User, workspaceId, identity);
}

const contextA = () => context("alex@coastalbloom.example", DEV_WORKSPACE_A);
const contextB = () => context("priya@harbourdental.example", DEV_WORKSPACE_B);
const entry = {
  category: "parking" as const,
  title: "Parking",
  content: "Free parking is available behind the building.",
  active: true,
};

function record(): IntegrationRecord {
  return {
    id: "integration_knowledge",
    workspaceId: DEV_WORKSPACE_A,
    type: "knowledge",
    provider: "pinecone",
    displayName: "Knowledge retrieval",
    purpose: "Search Business Knowledge",
    connection: "connected",
    health: "healthy",
    lastCheckedAt: null,
    lastSuccessfulSyncAt: null,
    capabilities: [
      { key: "search", label: "Search knowledge", enabled: true },
      { key: "reindex", label: "Reindex knowledge", enabled: true },
    ],
    config: [],
    admin: { environment: "sandbox" },
    lastError: null,
  };
}

describe("knowledge provider contracts", () => {
  it("keeps live mode fail-closed and projects only simulator readiness", async () => {
    const ctx = { record: record(), now: NOW };
    expect(await knowledgeProviderServerAdapter.testConnection(ctx)).toMatchObject({
      outcome: "healthy",
      health: "healthy",
    });

    process.env.KNOWLEDGE_PROVIDER_MODE = "live";
    expect(await knowledgeProviderServerAdapter.testConnection(ctx)).toMatchObject({
      outcome: "configuration_incomplete",
      health: "unknown",
    });
  });

  it("ignores stale upserts both before and after a newer deletion", async () => {
    const namespace = "kns_simulated_namespace";
    const base = { id: "kn_doc", category: "faq" as const, content: "Current", active: true };
    await simulatedKnowledgeProvider.upsert(namespace, { ...base, version: 2, title: "Newest" });
    await simulatedKnowledgeProvider.upsert(namespace, { ...base, version: 1, title: "Stale" });
    expect(await simulatedKnowledgeProvider.search(namespace, { text: "newest", limit: 5 })).toMatchObject([
      { title: "Newest" },
    ]);

    await simulatedKnowledgeProvider.remove(namespace, base.id, 3);
    await simulatedKnowledgeProvider.upsert(namespace, { ...base, version: 2, title: "Resurrected stale" });
    expect(await simulatedKnowledgeProvider.search(namespace, { text: "stale", limit: 5 })).toEqual([]);
  });

  it("rejects invalid retrieval input before provisioning a namespace", async () => {
    const ensureNamespace = vi.fn();
    const search = vi.fn();
    const repository = { ensureNamespace } as unknown as KnowledgeSyncRepository;
    const provider = { upsert: vi.fn(), remove: vi.fn(), search };
    const service = createKnowledgeSyncService(
      { workspaceId: DEV_WORKSPACE_A } as AuthContext,
      repository,
      () => provider
    );

    await expect(service.search("   ")).rejects.toMatchObject({
      code: "knowledge_invalid_request",
      retryable: false,
    });
    expect(ensureNamespace).not.toHaveBeenCalled();
    expect(search).not.toHaveBeenCalled();
  });

  it("normalizes provider retrieval failures without exposing raw details", async () => {
    const repository = {
      ensureNamespace: vi.fn().mockResolvedValue("kns_simulated_namespace"),
    } as unknown as KnowledgeSyncRepository;
    const provider: KnowledgeProviderClient = {
      upsert: vi.fn(),
      remove: vi.fn(),
      search: vi.fn().mockRejectedValue(new Error("api-key=secret raw provider body")),
    };
    const service = createKnowledgeSyncService(
      { workspaceId: DEV_WORKSPACE_A } as AuthContext,
      repository,
      () => provider
    );

    const failure = service.search("parking");
    await expect(failure).rejects.toMatchObject({
      code: "knowledge_provider_failed",
      retryable: true,
      message: "Business Knowledge retrieval is temporarily unavailable.",
    });
    await expect(failure).rejects.not.toThrow(/secret|raw provider body/i);
  });

  it("rejects malformed provider matches at the server boundary", async () => {
    const repository = {
      ensureNamespace: vi.fn().mockResolvedValue("kns_simulated_namespace"),
    } as unknown as KnowledgeSyncRepository;
    const provider: KnowledgeProviderClient = {
      upsert: vi.fn(),
      remove: vi.fn(),
      search: vi.fn().mockResolvedValue([
        { id: "kn_foreign", title: "Invalid", content: "Unsafe", score: Number.NaN },
      ]),
    };
    const service = createKnowledgeSyncService(
      { workspaceId: DEV_WORKSPACE_A } as AuthContext,
      repository,
      () => provider
    );

    await expect(service.search("parking")).rejects.toMatchObject({
      code: "knowledge_provider_failed",
      message: "Business Knowledge retrieval is temporarily unavailable.",
    });
  });

  it("enforces the requested result limit when a provider returns too many matches", async () => {
    const documents = new Map([
      ["kn_first", { id: "kn_local_first", providerDocumentId: "kn_first", title: "Local first", content: "Trusted parking one" }],
      ["kn_second", { id: "kn_local_second", providerDocumentId: "kn_second", title: "Local second", content: "Trusted parking two" }],
    ]);
    const findActiveByProviderDocumentIds = vi.fn(async (ids: string[]) =>
      ids.flatMap((id) => {
        const document = documents.get(id);
        return document ? [document] : [];
      })
    );
    const repository = {
      ensureNamespace: vi.fn().mockResolvedValue("kns_simulated_namespace"),
      findActiveByProviderDocumentIds,
    } as unknown as KnowledgeSyncRepository;
    const provider: KnowledgeProviderClient = {
      upsert: vi.fn(),
      remove: vi.fn(),
      search: vi.fn().mockResolvedValue([
        { id: "kn_first", title: "First", content: "Parking one", score: 1 },
        { id: "kn_second", title: "Second", content: "Parking two", score: 0.5 },
      ]),
    };
    const service = createKnowledgeSyncService(
      { workspaceId: DEV_WORKSPACE_A } as AuthContext,
      repository,
      () => provider
    );

    await expect(service.search("parking", 1)).resolves.toEqual([
      { id: "kn_local_first", title: "Local first", content: "Trusted parking one", score: 1 },
    ]);
    expect(findActiveByProviderDocumentIds).toHaveBeenCalledOnce();
    expect(findActiveByProviderDocumentIds).toHaveBeenCalledWith(["kn_first"]);
  });

  it("treats provider matches only as ranked ids and discards unknown documents", async () => {
    const repository = {
      ensureNamespace: vi.fn().mockResolvedValue("kns_simulated_namespace"),
      findActiveByProviderDocumentIds: vi.fn(async (ids: string[]) => ids.includes("provider_known")
        ? [{
            id: "kn_local",
            providerDocumentId: "provider_known",
            title: "Trusted title",
            content: "Trusted local content",
          }]
        : []),
    } as unknown as KnowledgeSyncRepository;
    const provider: KnowledgeProviderClient = {
      upsert: vi.fn(),
      remove: vi.fn(),
      search: vi.fn().mockResolvedValue([
        { id: "provider_unknown", title: "Foreign", content: "Untrusted foreign content", score: 1 },
        { id: "provider_known", title: "Stale", content: "Untrusted stale content", score: 0.8 },
        { id: "provider_known", title: "Duplicate", content: "Duplicate content", score: 0.7 },
      ]),
    };
    const service = createKnowledgeSyncService(
      { workspaceId: DEV_WORKSPACE_A } as AuthContext,
      repository,
      () => provider
    );

    await expect(service.search("parking")).resolves.toEqual([
      { id: "kn_local", title: "Trusted title", content: "Trusted local content", score: 0.8 },
    ]);
  });

  it("reports a stale failed synchronization as superseded", async () => {
    const document = {
      id: "kn_local",
      workspaceId: DEV_WORKSPACE_A,
      providerDocumentId: "provider_local",
      category: "parking" as const,
      title: "Newest local title",
      content: "Newest local content",
      active: true,
      syncState: "pending" as const,
      syncVersion: 1,
      syncedAt: null,
      deletedAt: null,
    };
    const markFailed = vi.fn().mockResolvedValue(false);
    const repository = {
      create: vi.fn().mockResolvedValue(document),
      ensureNamespace: vi.fn().mockResolvedValue("kns_simulated_namespace"),
      markFailed,
    } as unknown as KnowledgeSyncRepository;
    const provider: KnowledgeProviderClient = {
      upsert: vi.fn().mockRejectedValue(new Error("older request failed late")),
      remove: vi.fn(),
      search: vi.fn(),
    };
    const service = createKnowledgeSyncService(
      { workspaceId: DEV_WORKSPACE_A } as AuthContext,
      repository,
      () => provider
    );

    await expect(service.create(entry, NOW)).resolves.toEqual({
      state: "superseded",
      id: document.id,
    });
    expect(markFailed).toHaveBeenCalledWith(
      document.id,
      document.syncVersion,
      "error",
      "knowledge_provider_failed",
      "Business Knowledge was saved, but provider synchronization needs attention."
    );
  });

  it("does not automatically retry after provider success when local settlement fails", async () => {
    const document = {
      id: "kn_local",
      workspaceId: DEV_WORKSPACE_A,
      providerDocumentId: "provider_local",
      category: "parking" as const,
      title: "Current local title",
      content: "Current local content",
      active: true,
      syncState: "pending" as const,
      syncVersion: 1,
      syncedAt: null,
      deletedAt: null,
    };
    const markFailed = vi.fn().mockResolvedValue(true);
    const repository = {
      create: vi.fn().mockResolvedValue(document),
      ensureNamespace: vi.fn().mockResolvedValue("kns_simulated_namespace"),
      markSynced: vi.fn().mockRejectedValue(new Error("database response lost")),
      markFailed,
    } as unknown as KnowledgeSyncRepository;
    const upsert = vi.fn().mockResolvedValue(undefined);
    const provider: KnowledgeProviderClient = {
      upsert,
      remove: vi.fn(),
      search: vi.fn(),
    };
    const service = createKnowledgeSyncService(
      { workspaceId: DEV_WORKSPACE_A } as AuthContext,
      repository,
      () => provider
    );

    await expect(service.create(entry, NOW)).resolves.toEqual({
      state: "needs_attention",
      id: document.id,
      message: "Business Knowledge was synchronized, but confirmation needs attention.",
    });
    expect(upsert).toHaveBeenCalledOnce();
    expect(markFailed).toHaveBeenCalledWith(
      document.id,
      document.syncVersion,
      "sync_required",
      "knowledge_settlement_failed",
      "Business Knowledge was synchronized, but confirmation needs attention."
    );
  });
});

describeDb("knowledge provider tenancy and reconciliation", () => {
  beforeAll(async () => {
    process.env.KNOWLEDGE_PROVIDER_MODE = "simulated";
    await resetTestDatabase(NOW);
    sql = testDb();
    identity = new PostgresIdentityRepository(sql);
  }, 180_000);

  afterAll(async () => {
    await sql?.end({ timeout: 5 });
  });

  it("indexes and searches only through each server-issued workspace namespace", async () => {
    const a = await contextA();
    const b = await contextB();
    const aService = createKnowledgeSyncService(a, workspaceScope(a, sql).knowledgeSync, () => simulatedKnowledgeProvider);
    const bService = createKnowledgeSyncService(b, workspaceScope(b, sql).knowledgeSync, () => simulatedKnowledgeProvider);

    const created = await aService.create(entry, NOW);
    expect(created.state).toBe("synced");
    expect(await aService.search("parking building")).toMatchObject([
      { id: created.id, title: "Parking" },
    ]);
    expect(await bService.search("parking building")).toEqual([]);

    const [namespaces] = await sql<{ count: string; distinct_count: string }[]>`
      select count(*)::text as count, count(distinct namespace)::text as distinct_count
      from knowledge_provider_namespaces
      where workspace_id in (${DEV_WORKSPACE_A}, ${DEV_WORKSPACE_B})`;
    expect(namespaces).toEqual({ count: "2", distinct_count: "2" });
  });

  it("does not resolve or mutate a foreign entry id", async () => {
    const a = await contextA();
    const b = await contextB();
    const aService = createKnowledgeSyncService(a, workspaceScope(a, sql).knowledgeSync, () => simulatedKnowledgeProvider);
    const bService = createKnowledgeSyncService(b, workspaceScope(b, sql).knowledgeSync, () => simulatedKnowledgeProvider);
    const created = await aService.create({ ...entry, title: "Tenant A only" }, NOW);
    const foreign = await bService.create({ ...entry, title: "Tenant B only" }, NOW);

    expect(await bService.update(created.id, { title: "Tampered" }, NOW)).toBeNull();
    expect(await workspaceScope(a, sql).knowledgeSync.find(created.id)).toMatchObject({ title: "Tenant A only" });

    const maliciousProvider: KnowledgeProviderClient = {
      upsert: vi.fn(),
      remove: vi.fn(),
      search: vi.fn().mockResolvedValue([
        { id: foreign.id, title: "Tenant B only", content: "Foreign content", score: 1 },
      ]),
    };
    const guardedAService = createKnowledgeSyncService(
      a,
      workspaceScope(a, sql).knowledgeSync,
      () => maliciousProvider
    );
    expect(await guardedAService.search("foreign")).toEqual([]);
  });

  it("prevents a slower stale edit from overwriting or settling a newer revision", async () => {
    const a = await contextA();
    const repository = workspaceScope(a, sql).knowledgeSync;
    const initial = createKnowledgeSyncService(a, repository, () => simulatedKnowledgeProvider);
    const created = await initial.create({ ...entry, title: "Original" }, NOW);

    let releaseOlder!: () => void;
    let olderStarted!: () => void;
    const olderStartedPromise = new Promise<void>((resolve) => { olderStarted = resolve; });
    const releaseOlderPromise = new Promise<void>((resolve) => { releaseOlder = resolve; });
    const delayed: KnowledgeProviderClient = {
      async upsert(namespace, document) {
        if (document.version === 1) {
          olderStarted();
          await releaseOlderPromise;
        }
        await simulatedKnowledgeProvider.upsert(namespace, document);
      },
      remove: (...args) => simulatedKnowledgeProvider.remove(...args),
      search: (...args) => simulatedKnowledgeProvider.search(...args),
    };
    const service = createKnowledgeSyncService(a, repository, () => delayed);

    const older = service.update(created.id, { title: "Older edit" }, NOW);
    await olderStartedPromise;
    const newer = await service.update(created.id, { title: "Newest edit" }, NOW);
    releaseOlder();

    expect(newer).toMatchObject({ state: "synced" });
    expect(await older).toMatchObject({ state: "superseded" });
    expect(await service.search("newest edit")).toMatchObject([{ title: "Newest edit" }]);
    expect(await repository.find(created.id)).toMatchObject({ title: "Newest edit", syncState: "synced", syncVersion: 2 });
  });

  it("keeps disabled-provider writes local and pending for later reconciliation", async () => {
    const a = await contextA();
    process.env.KNOWLEDGE_PROVIDER_MODE = "disabled";
    const service = createKnowledgeSyncService(a, workspaceScope(a, sql).knowledgeSync);
    const created = await service.create({ ...entry, title: "Local policy" }, NOW);

    expect(created.state).toBe("local_only");
    expect(await workspaceScope(a, sql).knowledgeSync.find(created.id)).toMatchObject({ syncState: "pending" });
  });

  it("records a safe reconciliation state after provider failure", async () => {
    const a = await contextA();
    const failing: KnowledgeProviderClient = {
      upsert: async () => { throw new Error("api-key=secret raw provider body"); },
      remove: async () => { throw new Error("secret"); },
      search: async () => [],
    };
    const service = createKnowledgeSyncService(a, workspaceScope(a, sql).knowledgeSync, () => failing);
    const created = await service.create({ ...entry, title: "Needs retry" }, NOW);

    expect(created).toMatchObject({ state: "needs_attention" });
    const stored = await workspaceScope(a, sql).knowledgeSync.find(created.id);
    expect(stored?.syncState).toBe("error");
    const [error] = await sql<{ provider_error_message: string }[]>`
      select provider_error_message from knowledge_entries
      where workspace_id = ${DEV_WORKSPACE_A} and id = ${created.id}`;
    expect(error.provider_error_message).not.toContain("secret");
    expect(error.provider_error_message).not.toContain("raw provider body");
  });

  it("never automatically retries a non-retryable sync_required document", async () => {
    const a = await contextA();
    const upsert = vi.fn().mockRejectedValue(
      new KnowledgeProviderError("knowledge_live_unavailable", false, "Live provider unavailable.")
    );
    const provider: KnowledgeProviderClient = {
      upsert,
      remove: vi.fn(),
      search: vi.fn(),
    };
    const repository = workspaceScope(a, sql).knowledgeSync;
    const service = createKnowledgeSyncService(a, repository, () => provider);
    const created = await service.create({ ...entry, title: "Manual attention" }, NOW);

    expect(created).toMatchObject({ state: "needs_attention" });
    expect(await repository.find(created.id)).toMatchObject({ syncState: "sync_required" });
    const reconciled = await service.reconcile(NOW);
    expect(reconciled).not.toContainEqual(expect.objectContaining({ id: created.id }));
    expect(upsert.mock.calls.filter((call) => call[1]?.id === created.id)).toHaveLength(1);
    expect(await repository.markSynced(created.id, 0, NOW)).toBe(false);
    expect(await repository.find(created.id)).toMatchObject({ syncState: "sync_required" });
  });

  it("persists sync_required and avoids replay when provider success cannot be settled", async () => {
    const a = await contextA();
    const durableRepository = workspaceScope(a, sql).knowledgeSync;
    const repository = Object.create(durableRepository) as KnowledgeSyncRepository;
    repository.markSynced = vi.fn().mockRejectedValue(new Error("database response lost"));
    const upsert = vi.fn().mockResolvedValue(undefined);
    const provider: KnowledgeProviderClient = {
      upsert,
      remove: vi.fn(),
      search: vi.fn(),
    };
    const service = createKnowledgeSyncService(a, repository, () => provider);
    const created = await service.create({ ...entry, title: "Uncertain confirmation" }, NOW);

    expect(created).toMatchObject({ state: "needs_attention" });
    expect(await durableRepository.find(created.id)).toMatchObject({
      syncState: "sync_required",
    });
    const reconciled = await service.reconcile(NOW);
    expect(reconciled).not.toContainEqual(expect.objectContaining({ id: created.id }));
    expect(upsert).toHaveBeenCalledOnce();
  });

  it("does not let a late same-version failure overwrite a synced document", async () => {
    const a = await contextA();
    const repository = workspaceScope(a, sql).knowledgeSync;
    const service = createKnowledgeSyncService(a, repository, () => simulatedKnowledgeProvider);
    const created = await service.create({ ...entry, title: "Settled once" }, NOW);

    expect(created).toMatchObject({ state: "synced" });
    expect(await repository.markFailed(
      created.id,
      0,
      "error",
      "knowledge_provider_failed",
      "Late failure"
    )).toBe(false);
    expect(await repository.find(created.id)).toMatchObject({
      syncState: "synced",
      syncedAt: NOW.toISOString(),
    });
  });

  it("tombstones locally before idempotent provider deletion and hides the entry from business DTOs", async () => {
    const a = await contextA();
    const service = createKnowledgeSyncService(a, workspaceScope(a, sql).knowledgeSync, () => simulatedKnowledgeProvider);
    const created = await service.create({ ...entry, title: "Temporary parking" }, NOW);
    expect(await service.remove(created.id, NOW)).toMatchObject({ state: "synced" });
    expect(await service.search("temporary parking")).toEqual([]);

    const config = await workspaceScope(a, sql).configuration.load();
    expect(config?.knowledge.some((item) => item.id === created.id)).toBe(false);
    expect(await workspaceScope(a, sql).knowledgeSync.find(created.id)).toMatchObject({
      syncState: "synced",
      active: false,
      deletedAt: NOW.toISOString(),
    });
  });

  it("rejects oversized input before any local row or provider call", async () => {
    const a = await contextA();
    const upsert = vi.fn();
    const provider: KnowledgeProviderClient = { upsert, remove: vi.fn(), search: vi.fn() };
    const service = createKnowledgeSyncService(a, workspaceScope(a, sql).knowledgeSync, () => provider);
    const before = await sql<{ count: string }[]>`
      select count(*)::text as count from knowledge_entries where workspace_id = ${DEV_WORKSPACE_A}`;

    await expect(service.create({ ...entry, content: "x".repeat(20_001) }, NOW)).rejects.toMatchObject({
      code: "knowledge_invalid_request",
    });
    const after = await sql<{ count: string }[]>`
      select count(*)::text as count from knowledge_entries where workspace_id = ${DEV_WORKSPACE_A}`;
    expect(after[0].count).toBe(before[0].count);
    expect(upsert).not.toHaveBeenCalled();
  });
});
