/**
 * `ArticleView` — the response shape for the full-article endpoints.
 * See docs/specs/articles-crud.md § API surface.
 *
 * `authorId` is deliberately never included. Clients rely on
 * `author.username` for display; the server does the authoritative
 * ownership check on every write path anyway.
 */

export interface ArticleView {
  slug: string;
  title: string;
  subtitle: string | null;
  body: string;
  /** Slice 4c — cover image URL. Null when the author hasn't set one. */
  coverImageUrl: string | null;
  /** Slice 4c — cover alt. Null → decorative (renderer emits `alt=""`). */
  coverImageAlt: string | null;
  published: boolean;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  author: {
    username: string | null;
    name: string | null;
  };
}

/** Prisma `select` matching `ArticleView`. Kept next to the shape so a
 * change to one flags the other in review. */
export const articleViewSelect = {
  slug: true,
  title: true,
  subtitle: true,
  body: true,
  coverImageUrl: true,
  coverImageAlt: true,
  published: true,
  publishedAt: true,
  createdAt: true,
  updatedAt: true,
  author: {
    select: { username: true, name: true },
  },
} as const;
