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
 *
 * ## 4b: body shape
 *
 * `body` on `ArticleAttrs` / `CreatedArticle` stays a plain string —
 * every downstream test does text-based assertions on it. The factory
 * wraps that string in a Tiptap doc (`plainTextToTiptap`) before POSTing
 * because the 4b API only accepts JSON documents. Tests that need a
 * specific doc structure (marks, headings, links) construct the doc
 * inline and POST directly rather than routing through this factory.
 */

/** Minimal Tiptap ProseMirror doc shape. Loose on purpose — the
 * server-side Zod schema is the authoritative validator. */
export type TiptapDoc = {
  type: "doc";
  content: TiptapNode[];
};
type TiptapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
};

export type ArticleAttrs = {
  title: string;
  subtitle?: string;
  body: string;
  /** Slice 4c — optional cover image; must be on the upload allowlist. */
  coverImageUrl?: string | null;
  coverImageAlt?: string | null;
  published?: boolean;
};

export type CreatedArticle = ArticleAttrs & {
  slug: string;
};

function unique(prefix: string): string {
  return `${prefix}-${randomBytes(4).toString("hex")}`;
}

/**
 * Plain-text → Tiptap doc. Mirrors the SQL migration in the 4b spec:
 * paragraphs split on runs of ≥1 blank line; empty input becomes a
 * doc with a single empty paragraph.
 */
export function plainTextToTiptap(text: string): TiptapDoc {
  const paragraphs = text.split(/\n{2,}/).filter((p) => p.length > 0);
  if (paragraphs.length === 0) {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }
  return {
    type: "doc",
    content: paragraphs.map((para) => ({
      type: "paragraph",
      content: [{ type: "text", text: para }],
    })),
  };
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
    // POST payload uses the Tiptap doc; the returned `CreatedArticle`
    // keeps the plain-string body so downstream assertions like
    // `.toContainText(article.body)` stay ergonomic.
    const res = await api.post("/api/articles", {
      data: { ...attrs, body: plainTextToTiptap(attrs.body) },
    });
    if (!res.ok()) {
      throw new Error(
        `ArticleFactory.create() failed: POST /api/articles ${res.status()} — ${await res.text()}`,
      );
    }
    const json = (await res.json()) as { article: { slug: string } };
    return { ...attrs, slug: json.article.slug };
  }
}
