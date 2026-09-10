/**
 * Follow read/write helpers shared between Route Handlers and Server
 * Components. See docs/specs/follow.md.
 *
 * Keeping the follow mutations and reads on one module (rather than
 * inlining `db.follow.upsert(...)` at each call site) matches the
 * pattern set by `lib/articles/service.ts` — one place to grep for
 * "how is follow state written," one place to change if the write
 * path ever grows (denormalised counts, audit rows, etc.).
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import {
  encodeFollowListCursor,
  type FollowListCursor,
} from "@/lib/validation/follow-lists";

/**
 * Rendered on `/profiles/[username]/followers|following` rows and in
 * the two list-endpoint responses. See docs/specs/follow-lists.md §
 * New shape.
 *
 * `bioExcerpt` is a server-truncated slice of the raw `bio` — 120
 * chars + trailing `…` if truncated. Keeps the follower list from
 * doubling as a full-profile dump and shrinks the wire payload on
 * large-bio users.
 *
 * `viewerFollows` / `isSelf` are computed server-side per row so the
 * client doesn't need N follow-status probes to render N buttons.
 * Both are `undefined` when the caller is anonymous — omitted rather
 * than nulled so the shape can't leak session state.
 */
export interface PublicUserSummary {
  username: string;
  name: string | null;
  bioExcerpt: string | null;
  viewerFollows?: boolean;
  isSelf?: boolean;
}

/** Server-side bio truncation. Kept small so a large-bio user doesn't fatten every list row. */
const BIO_EXCERPT_LIMIT = 120;

function shapeBioExcerpt(raw: string | null): string | null {
  if (raw === null) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= BIO_EXCERPT_LIMIT) return trimmed;
  // Slice on codepoints so the `…` doesn't chop a multi-byte glyph in
  // half. `Array.from(str)` splits by full Unicode codepoint, not by
  // UTF-16 code unit.
  const codepoints = Array.from(trimmed);
  if (codepoints.length <= BIO_EXCERPT_LIMIT) return trimmed;
  return codepoints.slice(0, BIO_EXCERPT_LIMIT).join("") + "…";
}

/**
 * Is `viewerId` currently following `targetId`?
 *
 * Anonymous viewers should not call this — pass `undefined`
 * `viewerId` guarding at the call site instead. The current callers
 * (`/profiles/[username]` server component) always know whether a
 * session exists before invoking.
 */
export async function isFollowing(
  viewerId: string,
  targetId: string,
): Promise<boolean> {
  // Self-follow is impossible via the API but cheaply short-circuited
  // here so a caller doing an existence check on the viewer's own
  // profile doesn't touch the DB.
  if (viewerId === targetId) return false;
  const row = await db.follow.findUnique({
    where: {
      followerId_followingId: { followerId: viewerId, followingId: targetId },
    },
    select: { followerId: true },
  });
  return row !== null;
}

/**
 * Idempotent follow. Returns `{ created: true }` when a new row was
 * written, `{ created: false }` when a matching row already existed.
 * The route uses `created` to pick 201 vs. 200 — the response body
 * itself is identical either way (see spec § API contract).
 *
 * Self-follow is rejected at the route layer (400 `self-follow`), so
 * this helper assumes the caller has already checked. Passing the
 * viewer as both args would still create a row here — an intentional
 * decision: the guardrail lives with the request validation, not
 * every DB helper.
 */
export async function follow(
  followerId: string,
  followingId: string,
): Promise<{ created: boolean; followedAt: Date }> {
  // Fast path: probe first so the common "already following" case
  // (repeat click, refresh spam) returns 200 without a doomed
  // insert. Preserves the original `createdAt` so a re-follow
  // doesn't erase the historical timestamp.
  const existing = await db.follow.findUnique({
    where: {
      followerId_followingId: { followerId, followingId },
    },
    select: { createdAt: true },
  });
  if (existing) return { created: false, followedAt: existing.createdAt };

  // Concurrent-write reconciliation. Between the probe above and
  // the create below, another request (a rapid double-click before
  // the button's transition disables it, a curl on the side, a
  // second tab) can insert the same `(followerId, followingId)` row
  // and win the composite-PK race. Without the P2002 catch, the
  // loser's `create` throws and the route returns 500 — a spec
  // violation (POST /follow is contract-idempotent). Catching P2002
  // + re-reading the winner keeps the idempotency guarantee even
  // under overlap. Same cost on the happy path (no upsert, no
  // extra round-trip); one extra findUnique only on the losing side
  // of a race.
  try {
    const row = await db.follow.create({
      data: { followerId, followingId },
      select: { createdAt: true },
    });
    return { created: true, followedAt: row.createdAt };
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const winner = await db.follow.findUnique({
        where: {
          followerId_followingId: { followerId, followingId },
        },
        select: { createdAt: true },
      });
      if (winner) {
        // Report as "not created by us" so the route emits 200 —
        // matches what a client would have seen if their request
        // had arrived a millisecond later and taken the fast path
        // above.
        return { created: false, followedAt: winner.createdAt };
      }
    }
    throw err;
  }
}

/**
 * Idempotent unfollow. Returns whether a row was actually deleted;
 * the route ignores the flag (both cases → 204) but the return value
 * is useful for tests and for the seed's `--verbose` mode.
 */
export async function unfollow(
  followerId: string,
  followingId: string,
): Promise<{ deleted: boolean }> {
  const res = await db.follow.deleteMany({
    where: { followerId, followingId },
  });
  return { deleted: res.count > 0 };
}

// ---------------------------------------------------------------------------
// Follow-list reads — docs/specs/follow-lists.md § API surface.
// ---------------------------------------------------------------------------

/**
 * `SELECT count(*) FROM "Follow" WHERE "followingId" = $userId` —
 * "how many accounts follow this user". Backs the profile-header
 * count + the modified `GET /api/users/{username}` payload.
 */
export async function countFollowers(userId: string): Promise<number> {
  return db.follow.count({ where: { followingId: userId } });
}

/**
 * `SELECT count(*) FROM "Follow" WHERE "followerId" = $userId` —
 * "how many accounts does this user follow". Same DB path as
 * `listFollowedFeed`'s "which authors am I subscribed to", but this
 * one returns a scalar not a row set.
 */
export async function countFollowing(userId: string): Promise<number> {
  return db.follow.count({ where: { followerId: userId } });
}

/**
 * Shared row-shaping for both list directions. `rows` carries the
 * counterparty user (the follower on `/followers`, the followed on
 * `/following`); the direction-specific query pulls whichever
 * relation is opposite the fixed side.
 *
 * `viewerId === undefined` means anonymous — `viewerFollows` /
 * `isSelf` are stripped from the shape.
 */
async function shapeUserSummaries(
  rows: Array<{
    userId: string;
    username: string | null;
    name: string | null;
    bio: string | null;
  }>,
  viewerId: string | undefined,
): Promise<PublicUserSummary[]> {
  if (rows.length === 0) return [];

  // A missing `username` in the DB (nullable column) can't have a
  // profile URL and shouldn't have a follow button — filter out at
  // the boundary. Belt-and-braces: every currently-seeded and
  // API-created account has a username, but the column allows null.
  const usable = rows.filter(
    (r): r is typeof r & { username: string } => r.username !== null,
  );

  // Batch follow-status probe: one indexed query returns every
  // (viewer, target) edge the viewer holds against the listed users.
  // Cheaper than N `isFollowing()` round-trips at the top of a page.
  let followedIds = new Set<string>();
  if (viewerId !== undefined) {
    const rows = await db.follow.findMany({
      where: {
        followerId: viewerId,
        followingId: { in: usable.map((r) => r.userId) },
      },
      select: { followingId: true },
    });
    followedIds = new Set(rows.map((r) => r.followingId));
  }

  return usable.map((r) => {
    const base: PublicUserSummary = {
      username: r.username,
      name: r.name,
      bioExcerpt: shapeBioExcerpt(r.bio),
    };
    if (viewerId !== undefined) {
      base.isSelf = r.userId === viewerId;
      base.viewerFollows = followedIds.has(r.userId);
    }
    return base;
  });
}

/**
 * Page of accounts that follow the given target. Returns `null` when
 * the target username is unknown so the caller can pick between
 * `notFound()` (RSC) and a 404 JSON (route handler) without a
 * second lookup.
 *
 * Cursor pagination on `(createdAt DESC, followerId DESC)` — mirror
 * of the feed's `(publishedAt, id)` tuple compare. Same take-one-
 * extra probe for the `nextCursor` boundary.
 */
export async function listFollowers(
  username: string,
  opts: { limit: number; cursor?: FollowListCursor; viewerId?: string },
): Promise<{ items: PublicUserSummary[]; nextCursor: string | null } | null> {
  const target = await db.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (!target) return null;

  const { limit, cursor, viewerId } = opts;
  const cursorDate = cursor ? new Date(cursor.c) : null;

  const rows = await db.follow.findMany({
    where: {
      followingId: target.id,
      ...(cursor && cursorDate
        ? {
            OR: [
              { createdAt: { lt: cursorDate } },
              { createdAt: cursorDate, followerId: { lt: cursor.u } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { followerId: "desc" }],
    take: limit + 1,
    select: {
      createdAt: true,
      followerId: true,
      follower: {
        select: { id: true, username: true, name: true, bio: true },
      },
    },
  });

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const items = await shapeUserSummaries(
    pageRows.map((r) => ({
      userId: r.follower.id,
      username: r.follower.username,
      name: r.follower.name,
      bio: r.follower.bio,
    })),
    viewerId,
  );
  const nextCursor = hasMore
    ? encodeFollowListCursor({
        c: pageRows[pageRows.length - 1]!.createdAt.toISOString(),
        u: pageRows[pageRows.length - 1]!.followerId,
      })
    : null;
  return { items, nextCursor };
}

/**
 * Page of accounts the given target follows. Same shape + rules as
 * `listFollowers` — the direction of the query flips (`followerId`
 * fixed, `followingId` varies) and the cursor tiebreaker is
 * `followingId` instead of `followerId`.
 */
export async function listFollowing(
  username: string,
  opts: { limit: number; cursor?: FollowListCursor; viewerId?: string },
): Promise<{ items: PublicUserSummary[]; nextCursor: string | null } | null> {
  const target = await db.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (!target) return null;

  const { limit, cursor, viewerId } = opts;
  const cursorDate = cursor ? new Date(cursor.c) : null;

  const rows = await db.follow.findMany({
    where: {
      followerId: target.id,
      ...(cursor && cursorDate
        ? {
            OR: [
              { createdAt: { lt: cursorDate } },
              { createdAt: cursorDate, followingId: { lt: cursor.u } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { followingId: "desc" }],
    take: limit + 1,
    select: {
      createdAt: true,
      followingId: true,
      following: {
        select: { id: true, username: true, name: true, bio: true },
      },
    },
  });

  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const items = await shapeUserSummaries(
    pageRows.map((r) => ({
      userId: r.following.id,
      username: r.following.username,
      name: r.following.name,
      bio: r.following.bio,
    })),
    viewerId,
  );
  const nextCursor = hasMore
    ? encodeFollowListCursor({
        c: pageRows[pageRows.length - 1]!.createdAt.toISOString(),
        u: pageRows[pageRows.length - 1]!.followingId,
      })
    : null;
  return { items, nextCursor };
}
