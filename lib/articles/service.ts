/**
 * Article read/query helpers shared between Route Handlers and Server
 * Components. Centralising them lets the on-page render at
 * `/profiles/[username]` and the public JSON API at
 * `/api/users/{username}/articles` use the same code path — the two
 * can't drift.
 */
import { db } from "@/lib/db";

/**
 * Narrow "index card" shape for the public author-listing endpoint.
 * Deliberately omits `body`, `authorId`, `author`, `published`, and
 * timestamps other than `publishedAt`. Full detail requires a follow-up
 * `GET /api/articles/{slug}`.
 */
export interface PublicArticleSummary {
  slug: string;
  title: string;
  subtitle: string | null;
  publishedAt: Date | null;
}

/**
 * Return every *published* article by the given username, newest first.
 * Returns `null` if the username itself is unknown — the caller decides
 * how to surface that (JSON 404 vs. `notFound()` render).
 */
export async function listPublishedArticlesByUsername(
  username: string,
): Promise<PublicArticleSummary[] | null> {
  const user = await db.user.findUnique({
    where: { username },
    select: { id: true },
  });
  if (!user) return null;

  return db.article.findMany({
    where: { authorId: user.id, published: true },
    orderBy: { publishedAt: "desc" },
    select: { slug: true, title: true, subtitle: true, publishedAt: true },
  });
}
