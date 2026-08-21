import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * What a business user's browser is allowed to download.
 *
 * ── Why this test walks imports instead of checking a payload ───────────────
 * The existing leak tests check the *data* sent to a client-facing page, and
 * they were passing while the page's JavaScript bundle contained
 * `voice: ["vapi", "n8n", "model_provider"]` in plain text. Nothing rendered it;
 * it was simply in the chunk, because /connections imported a badge label from
 * the module the vendor map happened to live in.
 *
 * A payload check cannot see that. So this walks the real import graph from the
 * business-facing entry points and asserts it never reaches a module that names
 * a provider. It is a structural check, and it fails the moment someone adds a
 * convenient import back — which is the only way this stays true, since the
 * mistake is invisible in review.
 *
 * ── Why not just grep the build output ──────────────────────────────────────
 * That works, and it is part of the release QA. It also requires a production
 * build, which is far too slow to be the thing that catches this during
 * development. This runs in milliseconds against source.
 */

const ROOT = resolve(__dirname, "..");

/**
 * Pages a business user (owner, manager, staff) can reach.
 *
 * /admin/* is deliberately absent: administrators are the audience vendor names
 * exist for.
 */
const CLIENT_FACING_ENTRIES = [
  "app/connections/page.tsx",
  "app/page.tsx",
  "app/appointments/view.tsx",
  "app/customers/view.tsx",
  "app/conversations/view.tsx",
  "app/calls/view.tsx",
  "app/analytics/page.tsx",
  "app/business-profile/view.tsx",
  "app/ai-receptionist/page.tsx",
  "app/settings/page.tsx",
  "lib/store/workspace-stores.tsx",
  "lib/workspace-data.tsx",
];

/**
 * Modules that name a provider, and must therefore stay out of that graph.
 *
 * Listed by path rather than detected by scanning for vendor strings: a comment
 * explaining *why* a vendor must not appear would otherwise fail the test that
 * enforces it.
 */
const PROVIDER_BEARING = [
  "services/integrations-providers",
  "services/adapters",
  "data/integrations-seed",
  "server/integrations",
];

const EXTENSIONS = [".ts", ".tsx", "/index.ts", "/index.tsx"];

function resolveImport(specifier: string, fromFile: string): string | null {
  // Only first-party modules matter; a vendor name cannot arrive from `react`.
  const base = specifier.startsWith("@/")
    ? join(ROOT, specifier.slice(2))
    : specifier.startsWith(".")
      ? resolve(dirname(fromFile), specifier)
      : null;
  if (!base) return null;

  for (const extension of EXTENSIONS) {
    const candidate = `${base}${extension}`;
    if (existsSync(candidate)) return candidate;
  }
  return existsSync(base) ? base : null;
}

/** Every `import`/`export … from` specifier in a file, type-only ones included. */
function importsOf(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const specifiers: string[] = [];
  const pattern = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+["']([^"']+)["']/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) specifiers.push(match[1]);
  return specifiers;
}

/**
 * Where the graph legitimately stops.
 *
 * Two module kinds cannot carry their dependencies into a browser bundle, and
 * following through them would flag every server action's transitive imports as
 * a client leak — wrong, and noisy enough that a real finding would be lost in
 * the output:
 *
 *   • `"use server"` — the import becomes an RPC stub. The module's own imports
 *     stay on the server.
 *   • `server-only` — the module throws at build time if it is genuinely
 *     bundled for the client, so the only way one appears in a client file's
 *     import list is as an erased `import type`. Next enforces this boundary far
 *     more reliably than a regex could.
 *
 * Everything else is followed, including type-only imports of ordinary modules,
 * because the difference between `import type { X }` and `import { X }` is one
 * keyword and dropping it is exactly the mistake this test exists to catch.
 */
function isServerBoundary(file: string): boolean {
  const head = readFileSync(file, "utf8").slice(0, 400);
  return /^\s*["']use server["']/.test(head) || /^\s*import\s+["']server-only["']/m.test(head);
}

/**
 * Every first-party module reachable from an entry point.
 *
 * Type-only imports are followed deliberately. `import type` is erased by the
 * compiler, but a single mistaken non-type import of the same module puts the
 * whole thing in the bundle — and the difference between the two is one keyword
 * that is easy to drop.
 */
function importClosure(entry: string): Set<string> {
  const seen = new Set<string>();
  const queue = [entry];

  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);

    if (file !== entry && isServerBoundary(file)) continue;

    for (const specifier of importsOf(file)) {
      const resolved = resolveImport(specifier, file);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }
  return seen;
}

function normalise(path: string): string {
  return path.replace(/\\/g, "/");
}

describe("client-facing pages do not import provider infrastructure", () => {
  it.each(CLIENT_FACING_ENTRIES)("%s", (relative) => {
    const entry = join(ROOT, relative);
    expect(existsSync(entry), `entry ${relative} is missing — has it been renamed?`).toBe(true);

    const closure = [...importClosure(entry)].map(normalise);
    const offenders = closure.filter((file) =>
      PROVIDER_BEARING.some((forbidden) => file.includes(`/src/${forbidden}`))
    );

    expect(offenders, `${relative} reaches provider-bearing modules`).toEqual([]);
  });

  it("still reaches the client-safe half of the vocabulary", () => {
    // Guards against the test passing because the resolver quietly stopped
    // resolving anything: /connections genuinely does import the label maps.
    const closure = [...importClosure(join(ROOT, "app/connections/page.tsx"))].map(normalise);
    expect(closure.some((f) => f.endsWith("/src/services/integrations.ts"))).toBe(true);
  });
});
