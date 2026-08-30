import { randomBytes } from "node:crypto";

/**
 * Slug generation for articles. See docs/specs/articles-crud.md § Slug
 * generation.
 *
 *   - Kebab-case the title (lowercase, ASCII, non-alphanumeric → `-`,
 *     collapse consecutive `-`, trim).
 *   - Truncate the base to 60 chars.
 *   - Append `-` + 8 hex chars from `crypto.randomBytes(4)`.
 *
 * Total length is capped at ~69 chars. Uniqueness is enforced by the DB
 * `@unique` constraint — a retry loop on P2002 handles the pathological
 * case at the call site (currently unnecessary at our scale, but the
 * hex suffix already makes collisions astronomically unlikely).
 */
export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .normalize("NFKD")
    // Strip diacritics for a plain-ASCII slug.
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  // Empty base (title was, e.g., all emoji) → fall back to `article` so the
  // suffix still produces a valid slug.
  const stem = base.length > 0 ? base : "article";
  const suffix = randomBytes(4).toString("hex");
  return `${stem}-${suffix}`;
}
