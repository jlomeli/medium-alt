/**
 * Zod schemas for the Articles CRUD surface. Single source of truth:
 * the same schemas power server-side validation, client-side field
 * errors, and the OpenAPI document — see docs/specs/articles-crud.md.
 */
import { z } from "zod";

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

/** Plain text for 4a — Tiptap-shaped body lands in 4b. */
export const bodySchema = z
  .string()
  .min(1, { message: "Body is required" })
  .max(20_000, { message: "Body must be at most 20000 characters" });

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
