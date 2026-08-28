/**
 * Zod schemas for auth inputs. Single source of truth: the same schemas power
 * server-side validation in Route Handlers AND client-side field-level errors.
 *
 * See docs/specs/auth.md §Password policy for the rules encoded here.
 */
import { z } from "zod";

/**
 * min 8, must contain ≥1 upper, ≥1 lower, ≥1 digit.
 *
 * `.regex(...)` rather than `.refine(...)` so `zod-openapi` can emit the
 * character-class rule as a JSON Schema `pattern`. `.refine()` is an
 * arbitrary JS predicate — the OpenAPI emitter drops it silently, and the
 * round-trip test in e2e/api/openapi/spec.spec.ts caught the drift. A
 * single lookahead-based regex means one `pattern` in JSON Schema, and
 * the emitted schema now accepts and rejects exactly what Zod does.
 */
export const passwordSchema = z
  .string()
  .min(8, { message: "Password must be at least 8 characters" })
  .regex(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)/, {
    message: "Password must include an uppercase letter, a lowercase letter, and a digit",
  });

/** 3-30 chars, letters/digits/underscore/hyphen. */
export const usernameSchema = z
  .string()
  .min(3, { message: "Username must be at least 3 characters" })
  .max(30, { message: "Username must be at most 30 characters" })
  .regex(/^[a-zA-Z0-9_-]+$/, {
    message: "Username may only contain letters, digits, hyphens, and underscores",
  });

export const emailSchema = z.string().email({ message: "Email is invalid" });

export const registerSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  password: passwordSchema,
  name: z.string().max(80).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, { message: "Password is required" }),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;

export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1),
  newPassword: passwordSchema,
});
export type PasswordResetConfirmInput = z.infer<typeof passwordResetConfirmSchema>;
