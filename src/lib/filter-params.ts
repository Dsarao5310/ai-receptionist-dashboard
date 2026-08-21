import type { ReadonlyURLSearchParams } from "next/navigation";

/**
 * Reads a filter value out of the URL, accepting it only if it is one of the
 * known options. Analytics drill-downs link in with these (e.g.
 * "/conversations?intent=booking"), and an unrecognised or hand-typed value
 * falls back to the default rather than putting a page into an impossible state.
 */
export function readParam<T extends string>(
  params: ReadonlyURLSearchParams | URLSearchParams,
  key: string,
  allowed: readonly T[],
  fallback: T
): T {
  const raw = params.get(key);
  return raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

/**
 * What a page server component receives. A Promise since Next 15, and a value
 * may repeat in the query string, hence the array case.
 */
export type SearchParams = Promise<Record<string, string | string[] | undefined>>;
