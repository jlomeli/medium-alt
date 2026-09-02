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
