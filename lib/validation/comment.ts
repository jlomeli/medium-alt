/**
 * Zod schema for comment writes — see docs/specs/comments.md § API
 * surface + § Acceptance criteria.
 *
 * `body` is a plain-text string, trimmed, `1..MAX_COMMENT_BODY_LENGTH`.
 * The DB column is `TEXT` (uncapped) — this schema is the sole gate
 * for length so a confused client sees a shaped 400 rather than a
 * Postgres error.
 *
 * Rejection surfaces on the route as
 * `{ error: { field: "body", code: "out-of-range", message? } }`.
 * Whitespace-only bodies collapse to zero-length after `.trim()`, so
 * `"   " ` is rejected with the same `out-of-range` code as an empty
 * string — matches the UI copy ("Comment can't be empty.").
 */
import { z } from "zod";

export const MAX_COMMENT_BODY_LENGTH = 2000;

export const createCommentSchema = z
  .object({
    body: z
      .string()
      .transform((raw) => raw.trim())
      .pipe(
        z
          .string()
          .min(1, "Comment can't be empty.")
          .max(
            MAX_COMMENT_BODY_LENGTH,
            `Comment is too long (max ${MAX_COMMENT_BODY_LENGTH} characters).`,
          ),
      ),
  })
  .strict();

export type CreateCommentInput = z.infer<typeof createCommentSchema>;
