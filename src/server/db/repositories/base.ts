import "server-only";

import type { Sql } from "../client";

/**
 * The base every tenant-owned repository extends.
 *
 * It holds two things and exposes neither publicly: the connection, and the
 * authorized workspace id. Subclasses write `where workspace_id = ${this.ws}`
 * and cannot write anything else — there is no setter, and the id arrives
 * through the constructor from `workspaceScope`, which requires an
 * `AuthContext`.
 *
 * Repositories are cheap objects created per request. They hold no cache: a
 * cached row outliving the request that authorized it is exactly how one
 * tenant's data ends up in another tenant's response.
 */
export abstract class WorkspaceScopedRepository {
  constructor(
    protected readonly sql: Sql,
    /** Already authorized. Never a value that arrived from a client. */
    protected readonly ws: string
  ) {}
}

export type Row = Record<string, unknown>;

export const str = (v: unknown): string => (v == null ? "" : String(v));
export const nullableStr = (v: unknown): string | null => (v == null ? null : String(v));
export const num = (v: unknown): number => (v == null ? 0 : Number(v));
export const bool = (v: unknown): boolean => v === true;

/** Postgres `timestamptz` arrives as a Date; the domain speaks ISO strings. */
export const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
export const nullableIso = (v: unknown): string | null => (v == null ? null : iso(v));

/**
 * `date` and `time` columns are wall-clock values in the business timezone, and
 * must stay strings. Turning a `date` into a JS Date would attach the *server's*
 * zone to a value that means "the 18th, wherever this business is", and the
 * whole timezone architecture exists to prevent exactly that.
 */
export const dateOnly = (v: unknown): string =>
  v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10);

export const timeOnly = (v: unknown): string => String(v).slice(0, 5);
