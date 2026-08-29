/**
 * Zod schemas for the profile surface. Same single-source-of-truth pattern
 * as lib/validation/auth.ts — server validation, client field errors, and
 * the OpenAPI document all consume these.
 */
import { z } from "zod";
import { usernameSchema } from "@/lib/validation/auth";

/** Bio — free-form user text, single-tweet cap. See spec §Non-goals. */
export const bioSchema = z
  .string()
  .max(280, { message: "Bio must be at most 280 characters" });

/** Display name is optional at register and can be cleared here too. */
export const nameSchema = z
  .string()
  .max(80, { message: "Name must be at most 80 characters" });

/**
 * Partial update to `/api/me`. Every field is individually optional, but
 * the whole payload must include at least one — a submit with nothing
 * changed is a 400. Enforced via `refine` on the object.
 */
export const updateMeSchema = z
  .object({
    name: nameSchema.optional(),
    username: usernameSchema.optional(),
    bio: bioSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateMeInput = z.infer<typeof updateMeSchema>;
