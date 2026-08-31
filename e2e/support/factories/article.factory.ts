import type { APIRequestContext } from "@playwright/test";
import { randomBytes } from "node:crypto";

/**
 * Article factory. Mirrors UserFactory:
 *   - `.build(overrides)` — valid unique-by-default in-memory attrs (no DB).
 *   - `.create(api, overrides)` — POSTs to /api/articles via the given
 *     `APIRequestContext`. That context MUST already carry a session
 *     cookie — usually the one from `loggedInPage`'s browser context or
 *     from a POST to `/api/login` on the same jar.
 *
 * See docs/CODING_STANDARDS.md §Testing.
 */

export type ArticleAttrs = {
  title: string;
  subtitle?: string;
  body: string;
  published?: boolean;
};

export type CreatedArticle = ArticleAttrs & {
  slug: string;
};

function unique(prefix: string): string {
  return `${prefix}-${randomBytes(4).toString("hex")}`;
}

export class ArticleFactory {
  build(overrides: Partial<ArticleAttrs> = {}): ArticleAttrs {
    const slug = unique("art");
    return {
      title: `Article ${slug}`,
      subtitle: `About ${slug}`,
      body: `Body of ${slug}.\n\nSecond paragraph.`,
      published: false,
      ...overrides,
    };
  }

  async create(
    api: APIRequestContext,
    overrides: Partial<ArticleAttrs> = {},
  ): Promise<CreatedArticle> {
    const attrs = this.build(overrides);
    const res = await api.post("/api/articles", { data: attrs });
    if (!res.ok()) {
      throw new Error(
        `ArticleFactory.create() failed: POST /api/articles ${res.status()} — ${await res.text()}`,
      );
    }
    const json = (await res.json()) as { article: { slug: string } };
    return { ...attrs, slug: json.article.slug };
  }
}
