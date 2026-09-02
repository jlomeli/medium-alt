/**
 * Tag normalisation. See docs/specs/tags-feed.md § Tag normalisation.
 *
 * Both the API routes and the client-side form parse tag input through
 * this module so a preview in the editor never diverges from the value
 * the server will actually store.
 */

/** Cap on the length of a single normalised tag slug. */
export const MAX_TAG_SLUG_LENGTH = 30;

/** Cap on how many tags a single article can carry. */
export const MAX_TAGS_PER_ARTICLE = 5;

/**
 * Normalise one raw input into a slug. Steps:
 *   - Trim leading/trailing whitespace.
 *   - Unicode-normalize + strip diacritics so "café" → "cafe".
 *   - Lowercase.
 *   - Replace anything outside `[a-z0-9]` with `-`.
 *   - Collapse consecutive `-` and strip leading/trailing `-`.
 *
 * Returns the empty string when the input has no slug-able characters
 * (e.g. `"---"`, `"!!!"`, `"   "`). Callers should treat that as an
 * error, not silently drop — see spec § Non-goals ("Silent drop makes
 * 'why isn't my tag showing up?' impossible to debug").
 *
 * The slug is NOT length-capped here — the length check lives on
 * `tagsSchema` so a too-long tag surfaces as a field-scoped 400 rather
 * than being silently truncated to `MAX_TAG_SLUG_LENGTH`.
 */
export function slugifyTag(input: string): string {
  return input
    .trim()
    .normalize("NFKD")
    // Strip combining diacritics — same trick as `slugifyTitle` in
    // `lib/articles/slug.ts`, kept in this module to avoid a
    // slug-generation cross-import for a two-line regex.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Parsed tag pair. `slug` is what the DB stores + queries by; `name`
 * is the trimmed original the author typed, kept so we can preserve
 * display casing ("Testing" vs "testing").
 */
export interface ParsedTag {
  slug: string;
  name: string;
}

/**
 * Accept either a `string[]` (from JSON API bodies) or a comma-separated
 * `string` (from the editor's `<TagsInput>`) and return the parsed,
 * deduplicated, slug-normalised list.
 *
 * Dedup keys off `slug`, so `["Testing", "testing", " TESTING "]` all
 * collapse to a single entry (first display name wins).
 *
 * Empty entries (whitespace-only, or normalising to `""`) surface via
 * the `empty` array — callers decide whether to raise a 400 or drop.
 * The Zod boundary in `lib/validation/article.ts::tagsSchema` treats a
 * non-empty `empty` as a validation failure.
 */
export function parseTagInput(input: readonly string[] | string): {
  tags: ParsedTag[];
  empty: string[];
} {
  const raw = typeof input === "string" ? input.split(",") : input;
  const tags: ParsedTag[] = [];
  const empty: string[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (typeof entry !== "string") continue;
    const name = entry.trim();
    if (name.length === 0) continue; // A pure whitespace entry is ignored (e.g. trailing comma).
    const slug = slugifyTag(name);
    if (slug.length === 0) {
      empty.push(name);
      continue;
    }
    if (seen.has(slug)) continue;
    seen.add(slug);
    tags.push({ slug, name });
  }
  return { tags, empty };
}
