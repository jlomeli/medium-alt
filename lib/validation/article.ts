/**
 * Zod schemas for the Articles CRUD surface. Single source of truth:
 * the same schemas power server-side validation, client-side field
 * errors, and the OpenAPI document — see docs/specs/articles-crud.md
 * (slice 4a) and docs/specs/articles-editor.md (slice 4b).
 */
import { z } from "zod";
import { isAllowedHref } from "@/lib/articles/tiptap-extensions";
import { isAllowedUploadUrl } from "@/lib/uploads/host-allowlist";
import {
  MAX_TAGS_PER_ARTICLE,
  MAX_TAG_SLUG_LENGTH,
  parseTagInput,
} from "@/lib/tags/slug";

/** 1..120 chars — enough for a headline, short enough to render on one line. */
export const titleSchema = z
  .string()
  .min(1, { message: "Title is required" })
  .max(120, { message: "Title must be at most 120 characters" });

/**
 * Optional dek/subtitle. Empty string is accepted for form ergonomics
 * (a cleared field) but is coerced to `undefined` before it reaches Prisma.
 */
export const subtitleSchema = z
  .string()
  .max(200, { message: "Subtitle must be at most 200 characters" });

// -------- Tiptap body (slice 4b) --------

/**
 * The Tiptap ProseMirror doc shape, tightened to the node + mark
 * types we render. Anything outside this allowlist is a 400.
 *
 * Kept in lockstep with `articleExtensions` in
 * `lib/articles/tiptap-extensions.ts` — if you add a node here, add
 * the extension there (and vice-versa) or the two will drift and the
 * schema will accept docs the renderer will happily produce
 * unsafe-shaped HTML for.
 */
const ALLOWED_NODE_TYPES = new Set([
  "doc",
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "codeBlock",
  "hardBreak",
  "text",
  // Slice 4c — inline images. Attrs are validated separately below
  // (src must be on the upload host allowlist, alt is required).
  "image",
]);

const ALLOWED_MARK_TYPES = new Set(["bold", "italic", "code", "link"]);

/** Body cap in serialized-JSON bytes. See spec § Validation. */
const MAX_BODY_JSON_BYTES = 40_000;

const linkMarkSchema = z.object({
  type: z.literal("link"),
  attrs: z
    .object({ href: z.string().refine(isAllowedHref, { message: "Unsafe link URL" }) })
    .passthrough(),
});

const plainMarkSchema = z.object({
  type: z.enum(["bold", "italic", "code"]),
  attrs: z.record(z.string(), z.unknown()).optional(),
});

const markSchema = z.union([linkMarkSchema, plainMarkSchema]);

// Recursive node schema. Zod needs the `z.ZodType` annotation to type
// the recursion.
type TiptapNodeInput = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNodeInput[];
  marks?: Array<z.infer<typeof markSchema>>;
  text?: string;
};
const tiptapNodeSchema: z.ZodType<TiptapNodeInput> = z.lazy(() =>
  z.object({
    type: z.string().refine((t) => ALLOWED_NODE_TYPES.has(t), {
      message: "Unsupported node type",
    }),
    attrs: z
      .record(z.string(), z.unknown())
      .optional()
      .refine(
        (attrs) => {
          // Headings are restricted to h2/h3 (h1 is reserved for the
          // article title on the read view).
          if (!attrs) return true;
          if (typeof attrs.level === "number" && ![2, 3].includes(attrs.level)) {
            return false;
          }
          return true;
        },
        { message: "Unsupported heading level" },
      ),
    content: z.array(tiptapNodeSchema).optional(),
    marks: z
      .array(markSchema)
      .optional()
      .refine(
        (marks) => marks === undefined || marks.every((m) => ALLOWED_MARK_TYPES.has(m.type)),
        { message: "Unsupported mark type" },
      ),
    text: z.string().optional(),
  }),
);

// Not `.strict()` on nodes: Tiptap's `getJSON()` can emit extra keys
// (e.g. a `content: []` on a leaf that has no schema-declared content)
// that trip strict mode without adding any attack surface. The safety
// fence is the `ALLOWED_NODE_TYPES` / `ALLOWED_MARK_TYPES` set and
// `isAllowedHref` — the renderer only walks nodes whose extension is
// registered, so extra JSON keys are inert.
export const tiptapDocSchema = z.object({
  type: z.literal("doc"),
  content: z.array(tiptapNodeSchema),
});

/**
 * Attrs validator for `image` nodes (slice 4c). Kept out of the
 * recursive node schema so failures point at `body.<path>` rather
 * than a generic node-attrs error, and so the a11y rule
 * ("alt is required, min 1 char") stays visible near the URL rule.
 *
 * Called from `bodySchema.superRefine` for every node whose type is
 * `"image"`.
 */
function refineImageAttrs(
  attrs: Record<string, unknown> | undefined,
  ctx: z.RefinementCtx,
  path: (string | number)[],
): void {
  const src = attrs?.src;
  if (typeof src !== "string" || src.length === 0) {
    ctx.addIssue({ code: "custom", message: "Image src is required", path: [...path, "src"] });
  } else if (!isAllowedUploadUrl(src)) {
    ctx.addIssue({
      code: "custom",
      message: "Image src must be on the upload host allowlist",
      path: [...path, "src"],
    });
  }
  const alt = attrs?.alt;
  if (typeof alt !== "string" || alt.length < 1) {
    // The a11y rule. Screen-reader users are never handed an unlabelled
    // image; enforcing here means the editor's alt-text dialog is
    // ergonomics, not the safety fence.
    ctx.addIssue({ code: "custom", message: "Image alt text is required", path: [...path, "alt"] });
  } else if (alt.length > 200) {
    ctx.addIssue({
      code: "custom",
      message: "Image alt text must be at most 200 characters",
      path: [...path, "alt"],
    });
  }
  const title = attrs?.title;
  if (title !== undefined && (typeof title !== "string" || title.length > 200)) {
    ctx.addIssue({
      code: "custom",
      message: "Image title must be at most 200 characters",
      path: [...path, "title"],
    });
  }
}

/** Walk the doc, invoking `visit(node, path)` for every node reached. */
function walkNodes(
  node: TiptapNodeInput,
  path: (string | number)[],
  visit: (n: TiptapNodeInput, p: (string | number)[]) => void,
): void {
  visit(node, path);
  if (Array.isArray(node.content)) {
    node.content.forEach((child, idx) => {
      walkNodes(child, [...path, "content", idx], visit);
    });
  }
}

/**
 * Body validator. Must be a well-formed Tiptap doc, fit under the
 * serialized-JSON cap, and — for slice 4c — every `image` node's
 * `attrs` must pass `refineImageAttrs` (src on host allowlist + alt
 * present).
 */
export const bodySchema = tiptapDocSchema.superRefine((doc, ctx) => {
  const size = Buffer.byteLength(JSON.stringify(doc), "utf8");
  if (size > MAX_BODY_JSON_BYTES) {
    ctx.addIssue({
      code: "custom",
      message: `Body is too large (${size} bytes; max ${MAX_BODY_JSON_BYTES}).`,
    });
  }
  (doc.content ?? []).forEach((child, idx) => {
    walkNodes(child, ["content", idx], (n, p) => {
      if (n.type === "image") {
        refineImageAttrs(n.attrs, ctx, [...p, "attrs"]);
      }
    });
  });
});

// -------- Cover image (slice 4c) --------

/**
 * Cover image URL. Nullable both because we accept `null` from PATCH
 * to explicitly clear the field, and because articles created before
 * this slice have no cover. Non-null values must be on the upload
 * host allowlist (see `lib/uploads/host-allowlist.ts` § Validation).
 */
export const coverImageUrlSchema = z
  .string()
  .refine(isAllowedUploadUrl, { message: "Cover image URL must be on the upload host allowlist" })
  .nullable();

/**
 * Optional cover alt. Unlike inline images, cover alt is NOT required
 * — cover is a hero more than a content element, and requiring alt
 * before every save is a form-friction cost we don't want on the
 * primary create path. Renderer emits `alt=""` (decorative) when null.
 * See spec § Non-goals: "Alt-text on cover images being required."
 */
export const coverImageAltSchema = z
  .string()
  .max(200, { message: "Cover alt text must be at most 200 characters" })
  .nullable();

// -------- Tags (slice 5) --------

/**
 * Tag list on write. Accepts either an array of raw strings or a
 * comma-separated single string (the editor input format). Normalises
 * via `parseTagInput`, deduplicates by slug, and enforces the per-
 * article + per-slug caps from docs/specs/tags-feed.md.
 *
 * Errors are field-scoped on `tags` so the form can attach the
 * message to the right input. The order of the failure branches
 * mirrors "what would a caller hit first":
 *   1. `empty` — an entry that normalised to `""` (e.g. `"---"`).
 *   2. `too-many` — more than `MAX_TAGS_PER_ARTICLE` unique slugs.
 *   3. `too-long` — any single slug over `MAX_TAG_SLUG_LENGTH`.
 */
export const tagsSchema = z
  .union([z.array(z.string()), z.string()])
  .transform((input, ctx) => {
    const { tags, empty } = parseTagInput(input);
    if (empty.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: `Tag "${empty[0]}" has no letters or numbers`,
      });
      return z.NEVER;
    }
    if (tags.length > MAX_TAGS_PER_ARTICLE) {
      ctx.addIssue({
        code: "custom",
        message: `At most ${MAX_TAGS_PER_ARTICLE} tags per article`,
      });
      return z.NEVER;
    }
    const overCap = tags.find((t) => t.slug.length > MAX_TAG_SLUG_LENGTH);
    if (overCap) {
      ctx.addIssue({
        code: "custom",
        message: `Tag "${overCap.name}" is longer than ${MAX_TAG_SLUG_LENGTH} characters`,
      });
      return z.NEVER;
    }
    return tags;
  });

export const createArticleSchema = z.object({
  title: titleSchema,
  subtitle: subtitleSchema.optional(),
  body: bodySchema,
  published: z.boolean().optional(),
  coverImageUrl: coverImageUrlSchema.optional(),
  coverImageAlt: coverImageAltSchema.optional(),
  tags: tagsSchema.optional(),
});
export type CreateArticleInput = z.infer<typeof createArticleSchema>;

/**
 * Partial update — every field is individually optional, but the payload
 * must include at least one. Same shape as `updateMeSchema`.
 *
 * `slug` is deliberately not present here: it is server-generated at
 * create-time and immutable thereafter (see spec § Non-goals).
 *
 * `coverImageUrl: null` explicitly clears the cover on the row (and,
 * per API contract, `coverImageAlt` is cleared alongside it in the
 * route handler — a cover-less alt is inert).
 */
export const updateArticleSchema = z
  .object({
    title: titleSchema.optional(),
    subtitle: subtitleSchema.optional(),
    body: bodySchema.optional(),
    published: z.boolean().optional(),
    coverImageUrl: coverImageUrlSchema.optional(),
    coverImageAlt: coverImageAltSchema.optional(),
    // Providing `tags` (even as `[]`) replaces the article's tag set;
    // omitting the key leaves tags untouched. Same partial-update
    // semantics as the rest of the fields.
    tags: tagsSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateArticleInput = z.infer<typeof updateArticleSchema>;
