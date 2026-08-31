import { test, expect } from "@e2e/support/fixtures";
import { readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Coverage guard for the OpenAPI document.
 *
 * Scans `app/api/**\/route.ts`, converts each file path to its request
 * URL, and asserts every non-excluded route appears in the OpenAPI document
 * at `/api/openapi.json`. Result: a new Route Handler can't ship without a
 * matching `registerRoute(...)` call in `lib/openapi/routes.ts` — CI blocks
 * on it.
 *
 * When to add to `EXCLUDED_PATHS` below:
 *   - The endpoint is a dev/E2E-only seam (already guarded server-side).
 *   - The endpoint is owned by a third-party (Auth.js, Scalar) whose
 *     contract we don't want to document.
 *   - The endpoint is the docs/spec surface itself (self-reference loop).
 *
 * Each addition must carry a code comment explaining why.
 */

/** app/api/**\/route.ts paths that intentionally do NOT need OpenAPI coverage. */
// Paths are normalized to the OpenAPI templating convention (`{param}` not
// `[param]`) before comparison — see `dirToRoutePath` below. Catch-all
// segments like `[...nextauth]` normalize to `{...nextauth}`.
const EXCLUDED_PATHS = new Set<string>([
  // Dev/E2E-only seam, guarded by NODE_ENV + VERCEL_ENV + E2E env vars.
  "/api/test/password-reset/expire",
  // E2E-only upload-serve stub, gated on `E2E=1` at the handler (404 in
  // every other env). See docs/specs/articles-images.md § Testing seams.
  "/api/__test-uploads/{key}",
  // Auth.js catch-all. Third-party contract; we document only our custom
  // endpoints alongside it (register, login, password-reset/*).
  "/api/auth/{...nextauth}",
  // Self-references — documenting the docs docs itself is a loop.
  "/api/openapi.json",
  "/api/docs",
]);

const API_ROOT = path.join(process.cwd(), "app/api");

/** Walk `app/api/**` and return every path that contains a `route.ts` file. */
function findRouteHandlers(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = path.join(dir, entry);
    if (statSync(abs).isDirectory()) {
      results.push(...findRouteHandlers(abs));
    } else if (entry === "route.ts" || entry === "route.tsx") {
      results.push(dir);
    }
  }
  return results;
}

/**
 * Convert an absolute `app/api/foo/[id]/route.ts` dir to its OpenAPI-style
 * path — `/api/foo/{id}`. Next uses `[param]` and `[...catchAll]` for
 * dynamic segments; OpenAPI uses `{param}`. Normalising to the OpenAPI
 * form so the two representations can be compared directly.
 */
function dirToRoutePath(absDir: string): string {
  const rel = path.relative(path.join(process.cwd(), "app"), absDir);
  const raw = "/" + rel.split(path.sep).join("/");
  return raw.replace(/\[(\.\.\.)?([^\]]+)\]/g, "{$1$2}");
}

test.describe("@smoke @api openapi coverage", () => {
  test("every route handler is documented (or explicitly excluded)", async ({ api }) => {
    const discoveredDirs = findRouteHandlers(API_ROOT);
    const discoveredPaths = discoveredDirs.map(dirToRoutePath).sort();

    const specRes = await api.get("/api/openapi.json");
    expect(specRes.status()).toBe(200);
    const spec = (await specRes.json()) as { paths: Record<string, unknown> };
    const documentedPaths = new Set(Object.keys(spec.paths));

    const undocumented = discoveredPaths.filter((p) => {
      if (EXCLUDED_PATHS.has(p)) return false;
      return !documentedPaths.has(p);
    });

    expect(
      undocumented,
      `Route handlers exist without OpenAPI coverage. Either add a ` +
        `registerRoute(...) entry in lib/openapi/routes.ts or, if the route ` +
        `must not be documented, add it to EXCLUDED_PATHS in ` +
        `e2e/api/openapi/coverage.spec.ts with a rationale comment. ` +
        `Missing: ${undocumented.join(", ")}`,
    ).toEqual([]);
  });

  test("excluded paths still exist on disk (allowlist can't rot)", async () => {
    const discoveredDirs = findRouteHandlers(API_ROOT);
    const discoveredPaths = new Set(discoveredDirs.map(dirToRoutePath));

    const stale = [...EXCLUDED_PATHS].filter((p) => !discoveredPaths.has(p));

    expect(
      stale,
      `EXCLUDED_PATHS references route handlers that no longer exist. ` +
        `Remove them from e2e/api/openapi/coverage.spec.ts. Stale: ${stale.join(", ")}`,
    ).toEqual([]);
  });
});
