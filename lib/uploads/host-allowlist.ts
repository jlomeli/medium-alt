/**
 * Upload host allowlist — the single source of truth for which URLs
 * are permitted on `Article.coverImageUrl` and on Tiptap `image` node
 * `src` attrs.
 *
 * The security fence: without this, an author could POST an image node
 * whose `src` is any URL — including a tracker pixel or a spoofed
 * origin. Restricting to the CDN we own the auth flow into keeps the
 * `<img>` load path on trust boundaries we control. See
 * docs/specs/articles-images.md § Validation.
 *
 * Configuration:
 * - `UPLOADTHING_URL_PREFIXES` (comma-separated list) overrides the
 *   default hosts. Absent → defaults to the two official UploadThing
 *   origins.
 * - Under `E2E=1`, the local test-uploads route is added automatically
 *   so the in-process stub (see app/api/__test-uploads/[key]/route.ts)
 *   round-trips through the same schema in tests.
 */

const DEFAULT_UPLOADTHING_PREFIXES = ["https://utfs.io/", "https://ufs.sh/"];

/** The E2E stub serves recorded uploads from this prefix (see spec §
 *  Testing seams). Base URL matches Playwright's `webServer.url`. */
const E2E_STUB_PREFIX = "http://localhost:3000/__test-uploads/";

function readEnvPrefixes(): string[] {
  const raw = process.env.UPLOADTHING_URL_PREFIXES;
  if (!raw) return DEFAULT_UPLOADTHING_PREFIXES;
  return raw
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * The full allowlist evaluated at module-load. Server processes never
 * flip between "prod" and "E2E" mid-run, so caching here is safe;
 * tests that need to swap it use a separate process (Playwright's
 * webServer sets `E2E=1` before Next boots).
 *
 * Client-side bundles never see `process.env.E2E` (Next only inlines
 * `NEXT_PUBLIC_*` vars into the browser bundle). This module is
 * imported by the client-side `ArticleForm` for pre-submit URL
 * validation, so we also honour `NEXT_PUBLIC_E2E` — Playwright's
 * webServer sets both. Missing this made the client-side
 * `createArticleSchema.safeParse` silently reject stub URLs that the
 * server (which does see `E2E`) accepts.
 */
export const UPLOAD_URL_PREFIXES: readonly string[] = (() => {
  const base = readEnvPrefixes();
  if (process.env.E2E === "1" || process.env.NEXT_PUBLIC_E2E === "1") {
    return [E2E_STUB_PREFIX, ...base];
  }
  return base;
})();

/**
 * True iff `url` starts with any allowed prefix, matches
 * scheme/host/path shape strictly (no `..`, no protocol-relative
 * `//evil.com`), and its host substring includes the prefix's host —
 * belt-and-braces against `https://utfs.io.attacker.com/` slipping in.
 */
export function isAllowedUploadUrl(url: unknown): boolean {
  if (typeof url !== "string" || url.length === 0) return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const normalized = parsed.toString();
  return UPLOAD_URL_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

/**
 * Extract the trailing `<key>` path segment from an UploadThing URL.
 * `https://utfs.io/f/<key>` and `https://<app>.ufs.sh/f/<key>` both
 * put the file key as the last non-empty path segment; the E2E stub
 * mirrors the same shape at `http://localhost:3000/__test-uploads/<key>`.
 * Returns `null` for URLs outside the allowlist or with no key.
 */
export function extractUploadKey(url: unknown): string | null {
  if (!isAllowedUploadUrl(url)) return null;
  try {
    const { pathname } = new URL(url as string);
    const parts = pathname.split("/").filter((p) => p.length > 0);
    const last = parts[parts.length - 1];
    return last && last.length > 0 ? last : null;
  } catch {
    return null;
  }
}
