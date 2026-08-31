/**
 * Zod schemas for the Articles CRUD surface. Single source of truth:
 * the same schemas power server-side validation, client-side field
 * errors, and the OpenAPI document — see docs/specs/articles-crud.md
 * (slice 4a) and docs/specs/articles-editor.md (slice 4b).
 */
import { z } from "zod";
import { isAllowedHref } from "@/lib/articles/tiptap-extensions";

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
 * Body validator. Must be a well-formed Tiptap doc AND fit under the
 * serialized-JSON cap so a single article can't blow the request body
 * or the DB row.
 */
export const bodySchema = tiptapDocSchema.superRefine((doc, ctx) => {
  const size = Buffer.byteLength(JSON.stringify(doc), "utf8");
  if (size > MAX_BODY_JSON_BYTES) {
    ctx.addIssue({
      code: "custom",
      message: `Body is too large (${size} bytes; max ${MAX_BODY_JSON_BYTES}).`,
    });
  }
});

export const createArticleSchema = z.object({
  title: titleSchema,
  subtitle: subtitleSchema.optional(),
  body: bodySchema,
  published: z.boolean().optional(),
});
export type CreateArticleInput = z.infer<typeof createArticleSchema>;

/**
 * Partial update — every field is individually optional, but the payload
 * must include at least one. Same shape as `updateMeSchema`.
 *
 * `slug` is deliberately not present here: it is server-generated at
 * create-time and immutable thereafter (see spec § Non-goals).
 */
export const updateArticleSchema = z
  .object({
    title: titleSchema.optional(),
    subtitle: subtitleSchema.optional(),
    body: bodySchema.optional(),
    published: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateArticleInput = z.infer<typeof updateArticleSchema>;
