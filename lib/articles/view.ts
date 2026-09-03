/**
 * `ArticleView` — the response shape for the full-article endpoints.
 * See docs/specs/articles-crud.md § API surface.
 *
 * `authorId` is deliberately never included. Clients rely on
 * `author.username` for display; the server does the authoritative
 * ownership check on every write path anyway.
 */

export interface ArticleView {
  slug: string;
  title: string;
  subtitle: string | null;
  body: string;
  /** Slice 4c — cover image URL. Null when the author hasn't set one. */
  coverImageUrl: string | null;
  /** Slice 4c — cover alt. Null → decorative (renderer emits `alt=""`). */
  coverImageAlt: string | null;
  published: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  author: {
    username: string | null;
    name: string | null;
  };
  /**
   * Slice 5 — sorted list of tag slugs. Present on every response
   * shape so a client can render tag chips without a second round
   * trip. Sorted for deterministic diffs (the DB doesn't guarantee an
   * order across the many-to-many).
   */
  tags: string[];
  /**
   * Slice 7 — aggregate clap count across every reader. Always
   * present (0 for a never-clapped article) so client rendering is
   * uniform. See docs/specs/claps.md § API contract.
   */
  clapCount: number;
  /**
   * Slice 8 — aggregate comment count across every commenter.
   * Always present (0 for a never-commented article, and 0 for a
   * draft — drafts render no comments section). Uniform rendering,
   * same discipline as `clapCount`. See docs/specs/comments.md §
   * Additive shape changes.
   */
  commentCount: number;
  /**
   * Slice 7 — the current viewer's contribution + a convenience
   * `hasClapped` boolean. Present ONLY when the caller is
   * authenticated; for anonymous callers this key is OMITTED from
   * the response (not set to `null`) so downstream clients can
   * discriminate on presence rather than value. See docs/specs/claps.md
   * § API contract (§ Additive shape changes).
   */
  viewer?: {
    clapCount: number;
    hasClapped: boolean;
  };
}

/** Prisma `select` matching `ArticleView` (minus the aggregate/viewer
 * fields, which are populated separately from `lib/claps/service.ts`).
 * Kept next to the shape so a change to one flags the other in review. */
export const articleViewSelect = {
  slug: true,
  title: true,
  subtitle: true,
  body: true,
  coverImageUrl: true,
  coverImageAlt: true,
  published: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  author: {
    select: { username: true, name: true },
  },
  tags: { select: { slug: true } },
} as const;

/**
 * Shape a raw Prisma row (as selected via `articleViewSelect`) into
 * an `ArticleView`. Flattens the tag relation into the sorted string
 * array the API returns.
 *
 * Centralised so every route handler that reads an article passes
 * through the same normalisation — no risk of one route returning
 * `tags: [{ slug: "…" }]` and another returning `tags: string[]`.
 *
 * Slice 7 — `clapCount` is required; `viewer` is optional and appears
 * on the response only when supplied by the caller (authenticated
 * requests). Callers compute both via `lib/claps/service.ts` and pass
 * them in — this file stays free of a DB dependency.
 */
export function shapeArticleView<
  T extends {
    slug: string;
    title: string;
    subtitle: string | null;
    body: unknown;
    coverImageUrl: string | null;
    coverImageAlt: string | null;
    published: boolean;
    publishedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    author: { username: string | null; name: string | null };
    tags: Array<{ slug: string }>;
  },
>(
  row: T,
  claps: {
    clapCount: number;
    viewer?: { clapCount: number; hasClapped: boolean };
  },
  commentCount: number,
): ArticleView {
  return {
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    body: row.body as string,
    coverImageUrl: row.coverImageUrl,
    coverImageAlt: row.coverImageAlt,
    published: row.published,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    author: row.author,
    tags: row.tags.map((t) => t.slug).sort(),
    clapCount: claps.clapCount,
    commentCount,
    // Spread the viewer block only when supplied so the JSON output
    // has NO `viewer` key at all for anonymous callers. Present-vs-
    // absent is the contract; `null` would collapse two distinct
    // states.
    ...(claps.viewer ? { viewer: claps.viewer } : {}),
  };
}
