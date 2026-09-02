/**
 * Zod schemas for the feed + popular-tags endpoints. See
 * docs/specs/tags-feed.md § API surface.
 *
 * These schemas parse URL query strings, so they coerce the raw
 * `string`s the router hands us into typed values (numbers, decoded
 * cursors). Any coercion failure becomes a field-scoped 400 with the
 * same `{ error: { field, code, message? } }` shape the rest of the
 * write surface uses.
 */
import { z } from "zod";
import { MAX_TAG_SLUG_LENGTH, slugifyTag } from "@/lib/tags/slug";

/** Default page size for the feed. */
export const DEFAULT_FEED_LIMIT = 20;
/** Hard cap. See spec § Pagination — small enough to keep SSR snappy. */
export const MAX_FEED_LIMIT = 50;

/** Default page size for popular tags. */
export const DEFAULT_TAGS_LIMIT = 20;
/** Hard cap. Popular-tags queries scan `_ArticleToTag`; keep it bounded. */
export const MAX_TAGS_LIMIT = 50;

// -------- Cursor codec --------

/**
 * Opaque cursor payload. Base64url-encoded JSON on the wire; the
 * shape is an implementation detail we're free to change.
 *
 * `p` = `publishedAt` ISO string. `i` = article id (tiebreaker for
 * the rare same-millisecond publish). See spec § Pagination.
 */
export interface FeedCursor {
  p: string;
  i: string;
}

/** Serialise a cursor for the `nextCursor` field of a feed response. */
export function encodeCursor(cursor: FeedCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

/**
 * Parse the `?cursor=` query param. Returns `null` for a missing
 * cursor (first page) or throws for malformed input — the route
 * catches and returns 400 `{ field: "cursor", code: "invalid" }`.
 *
 * Explicit throw rather than an `error` return so `feedQuerySchema`
 * below can surface the failure through Zod's normal issue channel
 * and keep the route handler's error-shaping code paths uniform.
 */
export function decodeCursor(raw: string): FeedCursor {
  let json: unknown;
  try {
    json = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
  } catch {
    throw new Error("cursor is not valid base64url JSON");
  }
  if (
    typeof json !== "object" ||
    json === null ||
    typeof (json as FeedCursor).p !== "string" ||
    typeof (json as FeedCursor).i !== "string"
  ) {
    throw new Error("cursor payload is malformed");
  }
  const cursor = json as FeedCursor;
  // Reject a NaN `Date` so a garbage `p` doesn't slip into the WHERE
  // clause below and produce a query with `publishedAt < 'Invalid Date'`.
  if (Number.isNaN(new Date(cursor.p).getTime())) {
    throw new Error("cursor `p` is not a valid date");
  }
  return cursor;
}

// -------- Query schemas --------

/**
 * `GET /api/articles` query. Every field is optional; the route reads
 * missing values as "give me the first page of the global feed".
 *
 * `tag` is normalised through the same `slugifyTag` used at write time
 * so `/?tag=Software Testing` and `/?tag=software-testing` both land
 * on the same filtered feed.
 */
export const feedQuerySchema = z
  .object({
    tag: z
      .string()
      .transform((raw) => slugifyTag(raw))
      // Empty-after-normalise (e.g. `?tag=!!!`) is a soft empty state,
      // not a 400. The route hands the empty slug back to the DB which
      // matches zero rows — the caller sees the "no articles under this
      // tag" empty state, matching the spec's UX story.
      .refine((slug) => slug.length <= MAX_TAG_SLUG_LENGTH, {
        message: `Tag filter must be at most ${MAX_TAG_SLUG_LENGTH} characters`,
      })
      .optional(),
    cursor: z
      .string()
      .transform((raw, ctx) => {
        try {
          return decodeCursor(raw);
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
        // `parseInt("5abc")` silently returns `5`; `parseInt("5.5")` returns
        // `5`; `parseInt("1e3")` returns `1`. All are legitimate-looking
        // "limits" from parseInt's perspective and a bad way to interpret
        // a URL query param. Strict-integer regex first — reject anything
        // that isn't a bare non-negative integer — then convert.
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
          .max(MAX_FEED_LIMIT, { message: `limit must be at most ${MAX_FEED_LIMIT}` }),
      )
      .optional(),
  })
  .strict();
export type FeedQuery = z.infer<typeof feedQuerySchema>;

/**
 * `GET /api/feed` query — Your Feed. Same cursor + limit semantics as
 * `feedQuerySchema` above, but the `tag` field is *not* accepted:
 * Your Feed is scoped by author (via the follow relation), not by
 * tag. Combining the two dimensions is a v2 UX question — see
 * docs/specs/follow.md § Non-goals.
 *
 * Kept as a separate schema (rather than an `.omit()` of
 * `feedQuerySchema`) so the two OpenAPI declarations render without
 * inheritance and the "no `tag` param on /api/feed" decision is
 * visible in a single `grep`.
 */
export const feedYourQuerySchema = z
  .object({
    cursor: z
      .string()
      .transform((raw, ctx) => {
        try {
          return decodeCursor(raw);
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
          .max(MAX_FEED_LIMIT, { message: `limit must be at most ${MAX_FEED_LIMIT}` }),
      )
      .optional(),
  })
  .strict();
export type FeedYourQuery = z.infer<typeof feedYourQuerySchema>;

/** `GET /api/tags` query. Only `limit` for now. */
export const tagsQuerySchema = z
  .object({
    limit: z
      .string()
      .transform((raw, ctx) => {
        // `parseInt("5abc")` silently returns `5`; `parseInt("5.5")` returns
        // `5`; `parseInt("1e3")` returns `1`. All are legitimate-looking
        // "limits" from parseInt's perspective and a bad way to interpret
        // a URL query param. Strict-integer regex first — reject anything
        // that isn't a bare non-negative integer — then convert.
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
          .max(MAX_TAGS_LIMIT, { message: `limit must be at most ${MAX_TAGS_LIMIT}` }),
      )
      .optional(),
  })
  .strict();
export type TagsQuery = z.infer<typeof tagsQuerySchema>;
