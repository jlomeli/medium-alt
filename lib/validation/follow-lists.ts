/**
 * Zod schemas for the follower / following list endpoints. See
 * docs/specs/follow-lists.md § API surface.
 *
 * Kept in a sibling module to `feed.ts` (rather than jammed in) so a
 * grep for "follow-lists cursor" lands on this file and not on the
 * feed's article-shaped `FeedCursor`. Same base64url+JSON envelope,
 * different payload shape:
 *
 *   - Feed cursor: `{ p: publishedAt ISO, i: articleId }`.
 *   - Follow-list cursor: `{ c: createdAt ISO, u: otherUserId }`.
 *
 * The two share only the `limit` semantics; extracting a common
 * `parseLimit` helper is deferred until a third cursored endpoint
 * lands (rule of three).
 */
import { z } from "zod";

/** Default page size. Matches the feed's default so client wiring stays symmetric. */
export const DEFAULT_FOLLOW_LIST_LIMIT = 20;

/** Hard cap. Same rationale as `MAX_FEED_LIMIT` — keep SSR snappy. */
export const MAX_FOLLOW_LIST_LIMIT = 50;

/**
 * Opaque cursor payload for the two follow-list endpoints. Base64url-
 * encoded JSON on the wire; the shape is an implementation detail.
 *
 * `c` = `Follow.createdAt` ISO string. `u` = the OTHER user's id on
 * the row — `followerId` when paginating `/followers` (rows where the
 * `followingId` is fixed to the profile owner), `followingId` when
 * paginating `/following`. Naming it `u` instead of the direction-
 * specific `f`/`t` keeps one cursor shape across both endpoints so
 * the decoder isn't parameterised on direction.
 */
export interface FollowListCursor {
  c: string;
  u: string;
}

export function encodeFollowListCursor(cursor: FollowListCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

/**
 * Parse a `?cursor=` param. Same failure discipline as
 * `lib/validation/feed.ts::decodeCursor`: throw a plain `Error` so
 * `followListQuerySchema` can lift it through Zod's custom-issue
 * channel, and the route emits a uniform
 * `{ error: { field: "cursor", code: "invalid" } }` 400.
 */
export function decodeFollowListCursor(raw: string): FollowListCursor {
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw new Error("cursor is not valid base64url JSON");
  }
  if (
    typeof json !== "object" ||
    json === null ||
    typeof (json as FollowListCursor).c !== "string" ||
    typeof (json as FollowListCursor).u !== "string"
  ) {
    throw new Error("cursor payload is malformed");
  }
  const cursor = json as FollowListCursor;
  // Reject a NaN Date so a garbage `c` never reaches the DB WHERE.
  if (Number.isNaN(new Date(cursor.c).getTime())) {
    throw new Error("cursor `c` is not a valid date");
  }
  return cursor;
}

/**
 * `GET /api/users/{username}/followers` and `/following` share this
 * schema. Only `cursor` + `limit` are accepted; anything else on the
 * query string is a 400 (`.strict()`) so callers don't drift into
 * silently-ignored params.
 */
export const followListQuerySchema = z
  .object({
    cursor: z
      .string()
      .transform((raw, ctx) => {
        try {
          return decodeFollowListCursor(raw);
        } catch (err) {
          ctx.addIssue({
            code: "custom",
            message: err instanceof Error ? err.message : "invalid cursor",
          });
          return z.NEVER;
        }
      })
      .optional(),
    limit: z
      .string()
      .transform((raw, ctx) => {
        // Same strict-integer discipline as feed.ts — `parseInt` is too
        // permissive for a URL param. Reject anything that isn't a bare
        // non-negative integer.
        if (!/^\d+$/.test(raw)) {
          ctx.addIssue({ code: "custom", message: "limit must be an integer" });
          return z.NEVER;
        }
        return Number.parseInt(raw, 10);
      })
      .pipe(
        z
          .number()
          .int()
          .min(1, { message: `limit must be at least 1` })
          .max(MAX_FOLLOW_LIST_LIMIT, {
            message: `limit must be at most ${MAX_FOLLOW_LIST_LIMIT}`,
          }),
      )
      .optional(),
  })
  .strict();

export type FollowListQuery = z.infer<typeof followListQuerySchema>;
