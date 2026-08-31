/**
 * Shared Tiptap extension list for the article body.
 *
 * One import for both the client editor (`components/articles/
 * ArticleEditor.tsx`) and the server-side HTML renderer
 * (`lib/articles/tiptap.ts`) so the two sides can never disagree about
 * which nodes/marks are legal. The Zod allowlist in
 * `lib/validation/article.ts` mirrors this list — any node type here
 * must be spelled the same in the schema, and vice-versa.
 *
 * Deliberately no images (deferred to slice 4c), no tables, no
 * syntax-highlighted code blocks, no collaborative-editing extensions.
 * See docs/specs/articles-editor.md § Non-goals.
 */
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";

/**
 * URL schemes we allow on link marks. Everything else — most notably
 * `javascript:` and `data:` — is rejected server-side (Zod) and
 * scrubbed by the Link extension's `validate` at edit-time.
 */
const ALLOWED_HREF = /^(https?:|mailto:|\/|#)/i;

export function isAllowedHref(href: unknown): boolean {
  return typeof href === "string" && ALLOWED_HREF.test(href);
}

/**
 * Extended Link: rejects unsafe schemes and always renders
 * `rel="noopener noreferrer"`. Http(s) links additionally get
 * `target="_blank"` — treated as external for a substrate that has
 * no meaningful concept of "internal absolute link". Relative and
 * fragment links stay in-tab.
 */
const HardenedLink = Link.extend({
  renderHTML({ HTMLAttributes }) {
    const href = typeof HTMLAttributes.href === "string" ? HTMLAttributes.href : "";
    const attrs: Record<string, string> = {
      ...(HTMLAttributes as Record<string, string>),
      rel: "noopener noreferrer",
    };
    if (/^https?:/i.test(href)) {
      attrs.target = "_blank";
    }
    return ["a", attrs, 0];
  },
}).configure({
  openOnClick: false,
  autolink: false,
  linkOnPaste: false,
  validate: (href) => isAllowedHref(href),
});

/**
 * Extension list shared by editor + renderer. The Placeholder
 * extension is editor-only cosmetic and doesn't produce output nodes,
 * so serving it in the render path is harmless.
 */
export const articleExtensions = [
  StarterKit.configure({
    // StarterKit bundles a link extension; disable it so our hardened
    // one is the only Link on the pipeline.
    link: false,
    // Headings — restrict to h2/h3. h1 is reserved for the article
    // title on the read view.
    heading: { levels: [2, 3] },
  }),
  HardenedLink,
  Placeholder.configure({ placeholder: "Tell your story…" }),
];
