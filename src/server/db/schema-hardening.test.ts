import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Sql } from "@/server/db/client";
import { hasDatabase, resetTestDatabase, testMigratorDb } from "@/test/database";

const describeDb = hasDatabase ? describe : describe.skip;
const TEST_SCHEMA = process.env.DB_SCHEMA ?? "app_test";

let sql: Sql;

beforeAll(async () => {
  if (!hasDatabase) return;
  await resetTestDatabase();
  sql = testMigratorDb();
}, 180_000);

afterAll(async () => {
  await sql?.end({ timeout: 5 });
});

describeDb("provider and privacy schema hardening", () => {
  it("keeps Knowledge provider state private and least-privileged", async () => {
    const [privileges] = await sql<{
      owner: string;
      anon_schema_usage: boolean;
      authenticated_schema_usage: boolean;
      runtime_select: boolean;
      runtime_insert: boolean;
      runtime_update: boolean;
      runtime_delete: boolean;
      runtime_sync_state_update: boolean;
    }[]>`
      select
        pg_get_userbyid(c.relowner) as owner,
        has_schema_privilege('anon', n.oid, 'usage') as anon_schema_usage,
        has_schema_privilege('authenticated', n.oid, 'usage') as authenticated_schema_usage,
        has_table_privilege('app_runtime', c.oid, 'select') as runtime_select,
        has_table_privilege('app_runtime', c.oid, 'insert') as runtime_insert,
        has_table_privilege('app_runtime', c.oid, 'update') as runtime_update,
        has_table_privilege('app_runtime', c.oid, 'delete') as runtime_delete,
        has_column_privilege(
          'app_runtime',
          knowledge_entries.oid,
          'provider_sync_state',
          'update'
        ) as runtime_sync_state_update
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_class knowledge_entries
        on knowledge_entries.relnamespace = n.oid
       and knowledge_entries.relname = 'knowledge_entries'
      where n.nspname = ${TEST_SCHEMA}
        and c.relname = 'knowledge_provider_namespaces'
    `;

    expect(privileges).toEqual({
      owner: "app_migrator",
      anon_schema_usage: false,
      authenticated_schema_usage: false,
      runtime_select: true,
      runtime_insert: true,
      runtime_update: false,
      runtime_delete: false,
      runtime_sync_state_update: true,
    });
  });

  it("pins privacy trigger functions to the active schema and pg_catalog", async () => {
    const functions = await sql<{
      name: string;
      settings: string[] | null;
    }[]>`
      select p.proname as name, p.proconfig as settings
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = ${TEST_SCHEMA}
        and p.proname in (
          'create_default_workspace_privacy_policy',
          'initialize_call_privacy_state'
        )
      order by p.proname
    `;

    expect(functions).toEqual([
      {
        name: "create_default_workspace_privacy_policy",
        settings: [`search_path=${TEST_SCHEMA}, pg_catalog`],
      },
      {
        name: "initialize_call_privacy_state",
        settings: [`search_path=${TEST_SCHEMA}, pg_catalog`],
      },
    ]);
  });

  it("creates a covering index for every new email and erasure foreign key", async () => {
    const indexes = await sql<{ indexname: string; indexdef: string }[]>`
      select indexname, indexdef
      from pg_indexes
      where schemaname = ${TEST_SCHEMA}
        and indexname in (
          'email_threads_mailbox_fk_idx',
          'email_threads_customer_fk_idx',
          'email_threads_conversation_fk_idx',
          'email_messages_mailbox_fk_idx',
          'email_messages_thread_fk_idx',
          'email_messages_customer_fk_idx',
          'email_messages_conversation_fk_idx',
          'privacy_erasure_requests_requested_by_fk_idx',
          'privacy_erasure_requests_identity_verified_by_fk_idx',
          'privacy_erasure_requests_completed_by_fk_idx',
          'privacy_erasure_requests_rejected_by_fk_idx'
        )
      order by indexname
    `;

    expect(indexes).toHaveLength(11);
    expect(Object.fromEntries(indexes.map((index) => [index.indexname, index.indexdef]))).toMatchObject({
      email_threads_mailbox_fk_idx: expect.stringContaining("(workspace_id, mailbox_id)"),
      email_threads_customer_fk_idx: expect.stringContaining("(workspace_id, customer_id)"),
      email_threads_conversation_fk_idx: expect.stringContaining("(workspace_id, conversation_id)"),
      email_messages_mailbox_fk_idx: expect.stringContaining("(workspace_id, mailbox_id)"),
      email_messages_thread_fk_idx: expect.stringContaining("(workspace_id, thread_id)"),
      email_messages_customer_fk_idx: expect.stringContaining("(workspace_id, customer_id)"),
      email_messages_conversation_fk_idx: expect.stringContaining("(workspace_id, conversation_id)"),
      privacy_erasure_requests_requested_by_fk_idx: expect.stringContaining("(requested_by_user_id)"),
      privacy_erasure_requests_identity_verified_by_fk_idx: expect.stringContaining("(identity_verified_by_user_id)"),
      privacy_erasure_requests_completed_by_fk_idx: expect.stringContaining("(completed_by_user_id)"),
      privacy_erasure_requests_rejected_by_fk_idx: expect.stringContaining("(rejected_by_user_id)"),
    });
  });
});
