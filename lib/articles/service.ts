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
  /**
   * Slice 6 — restrict the feed to articles by a specific set of
   * author ids. `undefined` means "no author filter" (global feed);
   * an empty array is a shortcut to "no articles" without hitting
   * Prisma at all — used by `listFollowedFeed` when the viewer
   * follows nobody. See docs/specs/follow.md § API surface.
   */
  authorIn?: readonly string[];
  /**
   * Slice 6 — belt-and-braces exclusion of a specific author (in
   * practice, the viewer themselves on Your Feed). Applied on top of
   * `authorIn` so a hypothetical self-follow row seeded directly
   * against the DB doesn't leak the viewer's own drafts into their
   * feed.
   */
  excludeAuthorId?: string;
}): Promise<{ items: PublicArticleSummary[]; nextCursor: string | null }> {
  const { limit, cursor, tag, authorIn, excludeAuthorId } = opts;

  // Fast path: an explicitly-empty `authorIn` means "no possible
  // matches" (Your Feed with zero follows). Skip the DB round-trip
  // rather than emit `WHERE authorId IN ()` which some drivers
  // rewrite to `WHERE FALSE` — trivial cost but clearer intent.
  if (authorIn !== undefined && authorIn.length === 0) {
    return { items: [], nextCursor: null };
  }

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
      ...(authorIn ? { authorId: { in: [...authorIn] } } : {}),
      ...(excludeAuthorId ? { NOT: { authorId: excludeAuthorId } } : {}),
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

/**
 * Page of Your Feed — published articles from authors the viewer
 * follows. Reuses the global-feed pagination path via
 * `listPublishedFeed`'s `authorIn` + `excludeAuthorId` filters, so the
 * cursor shape is identical to `/api/articles` and the two feeds
 * share one code path from `WHERE` down. See docs/specs/follow.md §
 * API surface.
 *
 * `excludeAuthorId: viewerId` is belt-and-braces: normal API traffic
 * can't self-follow (`POST /follow` returns 400), but a directly-
 * seeded self-row shouldn't leak the viewer's own articles into their
 * feed either.
 */
export async function listFollowedFeed(opts: {
  viewerId: string;
  limit: number;
  cursor?: FeedCursor;
}): Promise<{ items: PublicArticleSummary[]; nextCursor: string | null }> {
  const { viewerId, limit, cursor } = opts;
  const follows = await db.follow.findMany({
    where: { followerId: viewerId },
    select: { followingId: true },
  });
  const followedIds = follows.map((f) => f.followingId);
  return listPublishedFeed({
    limit,
    cursor,
    authorIn: followedIds,
    excludeAuthorId: viewerId,
  });
}
