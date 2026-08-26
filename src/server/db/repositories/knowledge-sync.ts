import "server-only";

import type { KnowledgeEntry } from "@/types";
import { newId } from "../ids";
import { nullableIso, str, WorkspaceScopedRepository, type Row } from "./base";

export type KnowledgeSyncState = "pending" | "synced" | "error" | "sync_required";

export interface KnowledgeSyncDocument extends KnowledgeEntry {
  workspaceId: string;
  providerDocumentId: string;
  syncState: KnowledgeSyncState;
  syncVersion: number;
  syncedAt: string | null;
  deletedAt: string | null;
}

export class KnowledgeSyncRepository extends WorkspaceScopedRepository {
  async ensureNamespace(): Promise<string> {
    const namespace = newId("kns");
    await this.sql`
      insert into knowledge_provider_namespaces (workspace_id, namespace)
      values (${this.ws}, ${namespace})
      on conflict (workspace_id) do nothing`;
    const [row] = await this.sql`
      select namespace from knowledge_provider_namespaces
      where workspace_id = ${this.ws}`;
    if (!row) throw new Error("Knowledge namespace provisioning failed.");
    return str(row.namespace);
  }

  async create(entry: Omit<KnowledgeEntry, "id">): Promise<KnowledgeSyncDocument> {
    const id = newId("kn");
    const [row] = await this.sql`
      insert into knowledge_entries
        (id, workspace_id, category, title, content, active, position,
         provider_document_id, provider_sync_state)
      values
        (${id}, ${this.ws}, ${entry.category}, ${entry.title}, ${entry.content}, ${entry.active},
         coalesce((select max(position) + 1 from knowledge_entries
                   where workspace_id = ${this.ws} and deleted_at is null), 0),
         ${id}, 'pending')
      returning *`;
    return toDocument(row);
  }

  async prepareUpdate(
    id: string,
    patch: Partial<Omit<KnowledgeEntry, "id">>
  ): Promise<KnowledgeSyncDocument | null> {
    const [row] = await this.sql`
      update knowledge_entries set
        category = coalesce(${patch.category ?? null}, category),
        title = coalesce(${patch.title ?? null}, title),
        content = coalesce(${patch.content ?? null}, content),
        active = coalesce(${patch.active ?? null}, active),
        provider_sync_state = 'pending',
        provider_sync_version = provider_sync_version + 1,
        provider_error_code = null,
        provider_error_message = null
      where id = ${id} and workspace_id = ${this.ws} and deleted_at is null
      returning *`;
    return row ? toDocument(row) : null;
  }

  async prepareDelete(id: string, now: Date): Promise<KnowledgeSyncDocument | null> {
    const [row] = await this.sql`
      update knowledge_entries set
        active = false,
        deleted_at = ${now},
        provider_sync_state = 'pending',
        provider_sync_version = provider_sync_version + 1,
        provider_error_code = null,
        provider_error_message = null
      where id = ${id} and workspace_id = ${this.ws} and deleted_at is null
      returning *`;
    return row ? toDocument(row) : null;
  }

  async markSynced(id: string, version: number, now: Date): Promise<boolean> {
    const rows = await this.sql`
      update knowledge_entries set
        provider_sync_state = 'synced',
        provider_synced_at = ${now},
        provider_error_code = null,
        provider_error_message = null
      where id = ${id} and workspace_id = ${this.ws}
        and provider_sync_version = ${version}
        and provider_sync_state in ('pending', 'error')
      returning id`;
    return rows.length > 0;
  }

  async markFailed(id: string, version: number, state: "error" | "sync_required", code: string, message: string): Promise<boolean> {
    const rows = await this.sql`
      update knowledge_entries set
        provider_sync_state = ${state},
        provider_error_code = ${code},
        provider_error_message = ${message}
      where id = ${id} and workspace_id = ${this.ws}
        and provider_sync_version = ${version}
        and provider_sync_state in ('pending', 'error')
      returning id`;
    return rows.length > 0;
  }

  async find(id: string): Promise<KnowledgeSyncDocument | null> {
    const [row] = await this.sql`
      select * from knowledge_entries where id = ${id} and workspace_id = ${this.ws}`;
    return row ? toDocument(row) : null;
  }

  async findActiveByProviderDocumentIds(providerDocumentIds: string[]): Promise<KnowledgeSyncDocument[]> {
    const boundedIds = [...new Set(providerDocumentIds)].slice(0, 20);
    if (boundedIds.length === 0) return [];
    const rows = await this.sql`
      select * from knowledge_entries
      where workspace_id = ${this.ws}
        and provider_document_id in ${this.sql(boundedIds)}
        and active = true
        and deleted_at is null`;
    return rows.map(toDocument);
  }

  async pending(limit = 100): Promise<KnowledgeSyncDocument[]> {
    const rows = await this.sql`
      select * from knowledge_entries
      where workspace_id = ${this.ws}
        and provider_sync_state in ('pending', 'error')
      order by updated_at asc limit ${Math.max(1, Math.min(limit, 500))}`;
    return rows.map(toDocument);
  }
}

function toDocument(row: Row): KnowledgeSyncDocument {
  return {
    id: str(row.id),
    workspaceId: str(row.workspace_id),
    category: str(row.category) as KnowledgeEntry["category"],
    title: str(row.title),
    content: str(row.content),
    active: row.active === true,
    providerDocumentId: str(row.provider_document_id),
    syncState: str(row.provider_sync_state) as KnowledgeSyncState,
    syncVersion: Number(row.provider_sync_version),
    syncedAt: nullableIso(row.provider_synced_at),
    deletedAt: nullableIso(row.deleted_at),
  };
}
