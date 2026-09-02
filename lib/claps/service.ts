/**
 * Clap read/write helpers shared between Route Handlers and Server
 * Components. See docs/specs/claps.md.
 *
 * Same module-per-relation pattern as `lib/follows/service.ts` — the
 * write mutations and the aggregate reads live together so a change
 * to "how a clap becomes durable" or "how the count is derived" flips
 * in one place. The Route Handler at
 * `app/api/articles/[slug]/claps/route.ts` and the RSC at
 * `app/articles/[slug]/page.tsx` are both consumers.
 *
 * The per-viewer cap (`MAX_CLAPS_PER_VIEWER`) is enforced inside
 * `addClaps` under a transaction. A check constraint would fire
 * *after* the UPDATE and surface as an opaque DB error — putting the
 * cap in the service keeps the clamp logic and the count arithmetic
 * in one file.
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { MAX_CLAPS_PER_VIEWER } from "@/lib/validation/claps";

/**
 * Aggregate + viewer-specific state for the current caller on one
 * article. Shape mirrors what `GET /api/articles/{slug}` exposes on
 * its `viewer` sibling block.
 */
export interface ViewerClapState {
  clapCount: number;
  hasClapped: boolean;
}

/**
 * Result of `addClaps` — new counts after the write. `created` picks
 * 201 vs. 200 in the route (matches the follow route's convention);
 * `applied` is the actual delta the transaction wrote (may be less
 * than the requested delta when the cap intervened).
 */
export interface AddClapsResult {
  created: boolean;
  applied: number;
  viewerCount: number;
  totalCount: number;
}

/**
 * Read the viewer's clap contribution on one article. Anonymous
 * callers should not invoke this — pass `undefined` at the caller
 * and skip the read entirely.
 */
export async function getViewerClapState(
  userId: string,
  articleId: string,
): Promise<ViewerClapState> {
  const row = await db.clap.findUnique({
    where: { userId_articleId: { userId, articleId } },
    select: { count: true },
  });
  if (!row) return { clapCount: 0, hasClapped: false };
  return { clapCount: row.count, hasClapped: true };
}

/**
 * Aggregate `SUM(count)` for a single article. Convenience over the
 * `sumClapsForArticles` batch when the caller has one id — one
 * round-trip either way, but the caller keeps a clean scalar.
 */
export async function sumClapsForArticle(articleId: string): Promise<number> {
  const rows = await db.clap.aggregate({
    where: { articleId },
    _sum: { count: true },
  });
  return rows._sum.count ?? 0;
}

/**
 * Batch aggregate for enriching feed / listing responses. One
 * `groupBy articleId, _sum: { count }` call — no N+1. Empty input
 * skips the DB round-trip (fast path for "the feed has no rows"),
 * matching `listPublishedFeed`'s `authorIn: []` shortcut.
 *
 * Returned Map is keyed by article id; a missing entry means the
 * article has zero claps (rather than `null`) — the caller
 * defaults to 0 without needing a null-check.
 */
export async function sumClapsForArticles(
  articleIds: readonly string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (articleIds.length === 0) return result;

  const rows = await db.clap.groupBy({
    by: ["articleId"],
    where: { articleId: { in: [...articleIds] } },
    _sum: { count: true },
  });
  for (const row of rows) {
    result.set(row.articleId, row._sum.count ?? 0);
  }
  return result;
}

/**
 * Idempotent clap write. The composite `(userId, articleId)` primary
 * key gives us a natural upsert:
 *
 *   - Fast path — no existing row: `create` with `count = delta`
 *     (bounded to `MAX_CLAPS_PER_VIEWER`). `created: true` → route
 *     emits 201.
 *   - Existing row: read the current count under a row lock, clamp
 *     `count + delta` to `MAX_CLAPS_PER_VIEWER`, `update`. `created:
 *     false` → route emits 200.
 *
 * `applied` reflects the *actual* delta that landed in the DB —
 * less than the requested delta when the cap intervened. The total
 * count is recomputed from the aggregate rather than "old total +
 * applied" so concurrent claps from other viewers are visible in
 * the response without a second endpoint call.
 *
 * Self-clap is rejected at the route (400 `self-clap`), so this
 * helper assumes the caller has already checked. Same delegation
 * pattern as `follow` in `lib/follows/service.ts`.
 */
export async function addClaps(
  userId: string,
  articleId: string,
  delta: number,
): Promise<AddClapsResult> {
  if (delta <= 0 || !Number.isInteger(delta)) {
    // Defense in depth — validation should have caught this. Throwing
    // rather than silently normalising so a schema drift shows up in
    // the caller's error handler instead of a "why did my clap
    // disappear" bug report.
    throw new Error(`addClaps: delta must be a positive integer (got ${delta})`);
  }

  // Fast path — probe for an existing row before opening a
  // transaction. Same idempotency shape as `follow()`: an "already
  // has a row" happy path stays cheap.
  const existing = await db.clap.findUnique({
    where: { userId_articleId: { userId, articleId } },
    select: { count: true },
  });

  if (!existing) {
    // Try to insert. If a concurrent request wins the composite-PK
    // race the P2002 catch below reconciles by falling through to
    // the increment path — same "loser must still see idempotent
    // success" contract as `follow()`.
    const initialDelta = Math.min(delta, MAX_CLAPS_PER_VIEWER);
    try {
      await db.clap.create({
        data: { userId, articleId, count: initialDelta },
      });
      const totalCount = await sumClapsForArticle(articleId);
      return {
        created: true,
        applied: initialDelta,
        viewerCount: initialDelta,
        totalCount,
      };
    } catch (err) {
      if (
        !(err instanceof Prisma.PrismaClientKnownRequestError) ||
        err.code !== "P2002"
      ) {
        throw err;
      }
      // Fall through: another writer beat us to the create. Treat
      // this call as an increment on the existing row.
    }
  }

  // Increment path — read under FOR UPDATE, clamp, write. The row
  // lock serialises rapid taps from the same viewer so two POSTs
  // in flight can't both read `count = 40` and both write `50`
  // (losing the second delta) or both read `count = 49` and both
  // write `50` (making the total suddenly `99` when only two
  // claps were requested).
  const applied = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<Array<{ count: number }>>`
      SELECT "count" FROM "Clap"
      WHERE "userId" = ${userId} AND "articleId" = ${articleId}
      FOR UPDATE
    `;
    const currentCount = rows.length > 0 ? rows[0]!.count : 0;
    const nextCount = Math.min(currentCount + delta, MAX_CLAPS_PER_VIEWER);
    const applied = nextCount - currentCount;
    if (applied === 0) {
      // Already at cap — nothing to write. Skipping the UPDATE keeps
      // `updatedAt` stable so a "when did this viewer last engage"
      // query later isn't confused by cap-hit no-ops.
      return 0;
    }
    if (rows.length === 0) {
      // Reached here via the P2002 catch above and the winning row
      // has since been deleted (article-cascade race). Re-create.
      await tx.clap.create({
        data: { userId, articleId, count: nextCount },
      });
    } else {
      await tx.clap.update({
        where: { userId_articleId: { userId, articleId } },
        data: { count: nextCount },
      });
    }
    return applied;
  });

  const [viewer, totalCount] = await Promise.all([
    db.clap.findUnique({
      where: { userId_articleId: { userId, articleId } },
      select: { count: true },
    }),
    sumClapsForArticle(articleId),
  ]);
  return {
    created: false,
    applied,
    viewerCount: viewer?.count ?? 0,
    totalCount,
  };
}

/**
 * Idempotent clap-clear. Returns whether a row actually existed;
 * the route ignores the flag (both cases → 204) but the return
 * value is useful for tests and the seed's `--verbose` mode.
 * Matches the `unfollow()` shape.
 */
export async function clearClaps(
  userId: string,
  articleId: string,
): Promise<{ deleted: boolean }> {
  const res = await db.clap.deleteMany({
    where: { userId, articleId },
  });
  return { deleted: res.count > 0 };
}
