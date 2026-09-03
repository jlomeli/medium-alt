/**
 * Shared "can this caller touch this article?" gate for write-path
 * endpoints. First lifted out of the claps route in slice 8 so the
 * comments route + server action share one implementation.
 *
 * The rule (matches `GET /api/articles/{slug}` visibility):
 *   - Unknown slug          → null (caller sees 404).
 *   - Draft not owned       → null (caller sees 404). Anti-enumeration:
 *     a probe can't distinguish "never existed" from "exists as a
 *     draft someone else owns."
 *   - Draft owned by caller → returns the row with `published: false`.
 *     The caller decides whether that's acceptable — the claps route
 *     is fine with self-actions on own drafts (its self-clap check
 *     rejects on `authorId === callerId` a step later), while the
 *     comments write paths reject on `published === false` even for
 *     the author (see docs/specs/comments.md § UI surface /
 *     `<CommentForm>` step 4).
 *   - Published article     → returns the row.
 *
 * The `published` boolean is deliberately in the return type so
 * subsequent callers can reject their own edge cases without a
 * second DB round-trip.
 */
import { db } from "@/lib/db";

export type ResolvedArticle = {
  id: string;
  authorId: string;
  published: boolean;
};

export async function resolveArticleForCaller(
  slug: string,
  callerId: string,
): Promise<ResolvedArticle | null> {
  const row = await db.article.findUnique({
    where: { slug },
    select: { id: true, authorId: true, published: true },
  });
  if (!row) return null;
  if (!row.published && row.authorId !== callerId) return null;
  return { id: row.id, authorId: row.authorId, published: row.published };
}
