/**
 * Server-side rendering + shape helpers for the Tiptap article body.
 * See docs/specs/articles-editor.md § Rendering.
 *
 * Safety model: validation-by-construction. The Zod schema
 * (`lib/validation/article.ts`) rejects every node/mark type outside
 * the allowlist and every URL scheme outside `https?:` / `mailto:` /
 * `/` / `#` before a body ever reaches Prisma. `generateHTML` walking
 * an already-validated doc against the same extension list cannot
 * emit `<script>`, event handlers, or unsafe hrefs — so no DOMPurify
 * pass runs post-render. Fewer moving parts, one boundary.
 */
import { generateHTML } from "@tiptap/html";
import { articleExtensions } from "./tiptap-extensions";

/** Loose Tiptap doc shape. Zod is the authoritative validator; this
 *  type is just enough to keep TypeScript honest at boundaries. */
export type TiptapDoc = {
  type: "doc";
  content?: TiptapNode[];
};
type TiptapNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
};

/** Render a validated Tiptap document to HTML. */
export function renderTiptap(doc: TiptapDoc): string {
  // `generateHTML` accepts a JSON node; the type from @tiptap/core is
  // narrower than our loose type, so cast at the boundary.
  return generateHTML(doc as unknown as Parameters<typeof generateHTML>[0], articleExtensions);
}

/**
 * Convert a plain-text string to a Tiptap doc — mirrors the SQL
 * conversion in the `articles-body-to-json` migration so a Node-side
 * caller (tests, seed scripts, the ArticleForm's initial state)
 * produces the same shape the DB does. Paragraphs split on runs of
 * ≥1 blank line; empty input becomes a doc with one empty paragraph.
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

/** Empty doc — one empty paragraph. Used as the initial value on the
 *  new-article form. */
export function emptyDoc(): TiptapDoc {
  return { type: "doc", content: [{ type: "paragraph" }] };
}
