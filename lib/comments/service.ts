/**
 * Comment read/write helpers shared between Route Handlers, Server
 * Components, and the `postComment` server action. See
 * docs/specs/comments.md.
 *
 * Same module-per-relation pattern as `lib/claps/service.ts` and
 * `lib/follows/service.ts` — one place for the read shape, one place
 * for the write, so a route ↔ action drift is impossible.
 *
 * The internal `CommentWithAuthorship` shape (see § Response shapes)
 * carries `authorId` and a native `Date` on `createdAt`. The HTTP
 * boundary (route handlers) is where that shape becomes the public
 * `Comment` — `.toISOString()` on `createdAt` and drop `authorId`.
 * RSC callers get the internal shape and pass the `Date` straight to
 * a `<time>` renderer.
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

/**
 * Nested `author` sub-object shape returned everywhere a comment is
 * hydrated. `String?` on the schema for all three, so nullable on the
 * wire too. Superset of the article service's inline author select
 * (feed cards don't need an avatar, comment cards do) — the two are
 * deliberately not shared because a change here shouldn't flip feed
 * behaviour.
 */
export const publicAuthorSelect = {
  username: true,
  name: true,
  image: true,
} as const;

export type CommentAuthor = {
  username: string | null;
  name: string | null;
  image: string | null;
};

/**
 * Internal shape — RSC-side. Carries `authorId` for the delete-button
 * ownership gate (stable-id compare, not a username string compare
 * that could false-match across a future rename slice) and native
 * `Date` on `createdAt` for the `<time>` renderer.
 */
export type CommentWithAuthorship = {
  id: string;
  body: string;
  createdAt: Date;
  authorId: string;
  author: CommentAuthor;
};

/**
 * Thrown when a write reaches the DB but the referenced article
 * disappeared between `resolveArticleForCaller` and this call. Same
 * shape as `ClapTargetMissingError` — the route handler and the
 * server action both translate this to 404 rather than leaking a 500.
 */
export class CommentTargetMissingError extends Error {
  constructor() {
    super("comment target article no longer exists");
    this.name = "CommentTargetMissingError";
  }
}

/**
 * Distinguishes a "not on this article" 404 from a "not yours" 403
 * inside `deleteComment`. The comment id is publicly readable via
 * GET, so 403 for a wrong-owner delete is honest (leaks nothing new)
 * — see docs/specs/comments.md § Error shape.
 */
export class CommentForbiddenError extends Error {
  constructor() {
    super("caller does not own this comment");
    this.name = "CommentForbiddenError";
  }
}

/**
 * List oldest-first for the read page. Index-covered by
 * `@@index([articleId, createdAt, id])` — the `id` tiebreak keeps
 * ordering stable when two rows share a `createdAt` microsecond
 * (same reasoning the feed index carries `id`).
 */
export async function listCommentsForArticle(
  articleId: string,
): Promise<CommentWithAuthorship[]> {
  const rows = await db.comment.findMany({
    where: { articleId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      body: true,
      createdAt: true,
      authorId: true,
      author: { select: publicAuthorSelect },
    },
  });
  return rows;
}

/**
 * Aggregate `COUNT(*)` for a single article. Convenience over
 * `countCommentsForArticles` when the caller has one id — one
 * round-trip either way.
 */
export async function countCommentsForArticle(
  articleId: string,
): Promise<number> {
  return db.comment.count({ where: { articleId } });
}

/**
 * Batch count for enriching feed / listing responses. One
 * `groupBy articleId, _count` call — no N+1. Empty input skips the
 * DB round-trip, matching `sumClapsForArticles`.
 *
 * Returned Map is keyed by article id; a missing entry means the
 * article has zero comments (rather than `null`) — the caller
 * defaults to 0 without needing a null-check.
 */
export async function countCommentsForArticles(
  articleIds: readonly string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (articleIds.length === 0) return result;

  const rows = await db.comment.groupBy({
    by: ["articleId"],
    where: { articleId: { in: [...articleIds] } },
    _count: { _all: true },
  });
  for (const row of rows) {
    result.set(row.articleId, row._count._all);
  }
  return result;
}

/**
 * Insert one comment. Assumes the caller has already:
 *   - resolved the article via `resolveArticleForCaller`; and
 *   - verified `published === true` (the widened `ResolvedArticle`
 *     carries the boolean — see `lib/articles/access.ts`).
 *
 * The `include` on the nested author is what keeps the return type
 * matching `CommentWithAuthorship`; the default `create` (without
 * `include`) would return flat row columns and leak `articleId` to
 * the caller.
 *
 * Race: the article can be cascade-deleted between the resolve and
 * this insert. Prisma raises `P2003` (FK violation) — translate to
 * `CommentTargetMissingError` so the caller can reply 404 rather
 * than leaking a 500. Matches `addClaps`'s handling.
 */
export async function createComment(
  authorId: string,
  articleId: string,
  body: string,
): Promise<CommentWithAuthorship> {
  try {
    return await db.comment.create({
      data: { authorId, articleId, body },
      select: {
        id: true,
        body: true,
        createdAt: true,
        authorId: true,
        author: { select: publicAuthorSelect },
      },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2003"
    ) {
      throw new CommentTargetMissingError();
    }
    throw err;
  }
}

/**
 * Delete one comment, gated on `(articleId, commentId, callerId)`.
 * The three-way check exists so:
 *   - a comment id valid on a different article surfaces as 404
 *     (matches the URL contract — the pairing is what identifies
 *     the resource);
 *   - a caller who isn't the comment author surfaces as 403 (the
 *     comment id is publicly readable via GET, so 403 leaks
 *     nothing new — see docs/specs/comments.md § Error shape);
 *   - article-author moderation is deliberately absent (v1
 *     non-goal — even the article's author gets 403 on someone
 *     else's comment).
 *
 * Idempotency vs. 404: unlike `clearClaps`, a repeat DELETE is not
 * silently 204'd — the comment id is content-addressable, so a
 * repeat delete on a gone row means "you're deleting something that
 * doesn't exist" and 404 is the honest answer.
 */
export async function deleteComment(
  callerId: string,
  articleId: string,
  commentId: string,
): Promise<void> {
  const row = await db.comment.findUnique({
    where: { id: commentId },
    select: { articleId: true, authorId: true },
  });
  // Unknown id OR pairing mismatch → 404.
  if (!row || row.articleId !== articleId) {
    throw new CommentTargetMissingError();
  }
  // Wrong owner → 403.
  if (row.authorId !== callerId) {
    throw new CommentForbiddenError();
  }
  await db.comment.delete({ where: { id: commentId } });
}
