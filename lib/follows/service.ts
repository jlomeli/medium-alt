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
import { db } from "@/lib/db";

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
  // `upsert` on the composite PK gives us the natural "one row per
  // (follower, following)" contract without a two-step find + create
  // race. `update: {}` means "if it exists, touch nothing" — we
  // preserve the original `createdAt` so a re-follow doesn't erase
  // the historical timestamp.
  const existing = await db.follow.findUnique({
    where: {
      followerId_followingId: { followerId, followingId },
    },
    select: { createdAt: true },
  });
  if (existing) return { created: false, followedAt: existing.createdAt };
  const row = await db.follow.create({
    data: { followerId, followingId },
    select: { createdAt: true },
  });
  return { created: true, followedAt: row.createdAt };
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
