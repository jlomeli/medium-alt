/**
 * Article read/query helpers shared between Route Handlers and Server
 * Components. Centralising them lets the on-page render at
 * `/profiles/[username]` and the public JSON API at
 * `/api/users/{username}/articles` use the same code path — the two
 * can't drift.
 *
 * Slice 5 adds the global-feed reader (`listPublishedFeed`) and the
 * popular-tags reader (`listPopularTags`) here for the same reason:
 * the home page and the `GET /api/articles` / `GET /api/tags`
 * endpoints share these queries verbatim.
 */
import { db } from "@/lib/db";
import { encodeCursor, type FeedCursor } from "@/lib/validation/feed";

/**
 * Narrow "index card" shape for public article listings. Deliberately
 * omits `body`, `authorId`, `published`, and timestamps other than
 * `publishedAt`. Full detail requires a follow-up `GET
 * /api/articles/{slug}`.
 *
 * Slice 5 additions:
 *   - `tags` — sorted slug list so JSON output diffs deterministically.
 *   - `author` — `{ username, name }`. The global feed needs it to
 *     render an author byline on each card; the existing per-user
 *     endpoint also gains it (additive, no client breaks).
 */
export interface PublicArticleSummary {
  slug: string;
  title: string;
  subtitle: string | null;
  publishedAt: Date | null;
  tags: string[];
  author: {
    username: string | null;
    name: string | null;
  };
}

/**
 * One row from the popular-tags endpoint. `count` is a snapshot of
 * how many published articles carried the tag at query time — not
 * denormalised on `Tag`, so no write-path bookkeeping.
 */
export interface PopularTag {
  slug: string;
  name: string;
  count: number;
}

/**
 * Prisma `select` matching `PublicArticleSummary`. Shared by every
 * listing query so a shape change here (adding a field, dropping one)
 * flags every call site in review at once.
 */
const publicArticleSummarySelect = {
  slug: true,
  title: true,
  subtitle: true,
  publishedAt: true,
  tags: { select: { slug: true } },
  author: { select: { username: true, name: true } },
} as const;

type RawArticleRow = {
  slug: string;
  title: string;
  subtitle: string | null;
  publishedAt: Date | null;
  tags: Array<{ slug: string }>;
  author: { username: string | null; name: string | null };
};

/** Flatten the Prisma tag join into the sorted string array the API returns. */
function shapeSummary(row: RawArticleRow): PublicArticleSummary {
  return {
    slug: row.slug,
    title: row.title,
    subtitle: row.subtitle,
    publishedAt: row.publishedAt,
    // Sort deterministically so OpenAPI examples + test fixtures diff
    // cleanly. The DB doesn't guarantee ordering across the many-to-many.
    tags: row.tags.map((t) => t.slug).sort(),
    author: row.author,
  };
}

/**
 * Return every *published* article by the given username, newest
 * first. Returns `null` if the username itself is unknown — the
 * caller decides how to surface that (JSON 404 vs. `notFound()`
 * render).
 */
export async function listPublishedArticlesByUsername(
  username: string,
): Promise<PublicArticleSummary[] | null> {
  const user = await db.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (!user) return null;

  const rows = await db.article.findMany({
    where: { authorId: user.id, published: true },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    select: publicArticleSummarySelect,
  });
  return rows.map(shapeSummary);
}

/**
 * Page of the global published-articles feed. Cursor pagination on
 * `(publishedAt DESC, id DESC)` — see docs/specs/tags-feed.md §
 * Pagination.
 *
 * `nextCursor` is `null` when the returned page is the last one
 * (i.e. `rows.length < limit`). Callers pass an opaque `cursor`
 * string back on the next request; it's already been decoded by
 * `feedQuerySchema`.
 */
export async function listPublishedFeed(opts: {
  limit: number;
  cursor?: FeedCursor;
  tag?: string;
}): Promise<{ items: PublicArticleSummary[]; nextCursor: string | null }> {
  const { limit, cursor, tag } = opts;

  // `where` is built up piecewise so the `tag` and `cursor` clauses
  // stay independently readable. Compound `(publishedAt, id) < ...` is
  // expressed as the disjunction Prisma can plan:
  //   publishedAt < cursor.p  OR  (publishedAt = cursor.p AND id < cursor.i)
  // — same rows as the tuple comparison, easier for a code reviewer to
  // trace without SQL knowledge.
  const cursorDate = cursor ? new Date(cursor.p) : null;
  const rows = await db.article.findMany({
    where: {
      published: true,
      ...(tag ? { tags: { some: { slug: tag } } } : {}),
      ...(cursor && cursorDate
        ? {
            OR: [
              { publishedAt: { lt: cursorDate } },
              { publishedAt: cursorDate, id: { lt: cursor.i } },
            ],
          }
        : {}),
    },
    orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
    // Fetch one extra row as a "is there anything after this page?"
    // probe. Without the +1, a page whose size is exactly `limit`
    // (matching-article count is a multiple of the page size) would
    // still emit a cursor and send the client to an empty follow-up
    // page — the exact boundary the previous `rows.length < limit`
    // check missed. Slicing the probe off before shaping keeps the
    // response contract intact.
    take: limit + 1,
    // Cursor fields are selected alongside the summary so we can build
    // `nextCursor` without a second query. `id` is not part of the
    // public shape — `shapeSummary` drops it via structural picking.
    select: { ...publicArticleSummarySelect, id: true },
  });

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const items = pageRows.map(shapeSummary);
  const nextCursor = hasMore
    ? encodeCursor({
        p: pageRows[pageRows.length - 1]!.publishedAt!.toISOString(),
        i: pageRows[pageRows.length - 1]!.id,
      })
    : null;
  return { items, nextCursor };
}

/**
 * Popular tags — top N by count of *published* articles carrying
 * the tag, count descending. Ties broken alphabetically by slug for
 * deterministic ordering.
 *
 * Draft-only tags never appear because the `articles` filter narrows
 * to `published = true` before the count is taken; a tag whose entire
 * article set is draft yields count 0 and drops off the list.
 *
 * The count is computed in-memory rather than through Prisma's
 * `_count` because that helper counts *all* joined articles and we
 * need the published-only slice. The query fetches only tags that
 * have at least one published article via `some`, so we never scan
 * long-orphaned rows.
 */
export async function listPopularTags(limit: number): Promise<PopularTag[]> {
  // 1. Fetch tags that have any published article; pull their published
  //    articles' ids so we can count without a second round-trip. Slug
  //    ordering here is a deterministic pre-sort so ties in the final
  //    sort resolve the same way across DBs regardless of insert order.
  const tags = await db.tag.findMany({
    where: { articles: { some: { published: true } } },
    orderBy: { slug: "asc" },
    select: {
      slug: true,
      name: true,
      articles: {
        where: { published: true },
        select: { id: true },
      },
    },
  });

  // 2. Sort by count desc, slug asc, then trim to `limit`. Doing the
  //    trim here (post-sort) rather than as a Prisma `take` preserves
  //    the tie-break contract.
  return tags
    .map((t) => ({ slug: t.slug, name: t.name, count: t.articles.length }))
    .sort((a, b) => (b.count - a.count) || a.slug.localeCompare(b.slug))
    .slice(0, limit);
}
