/**
 * Zod schemas for account-security inputs — `/api/me/password`,
 * `/api/me/email`, `/api/me/email/confirm`.
 *
 * Kept in its own module (not `lib/validation/profile.ts`) so
 * "profile shape" (name, username, bio) and "credentials"
 * (password, email identity) don't cross-import. See
 * docs/specs/account-security.md § API surface.
 *
 * Reuses the existing `passwordSchema` + `emailSchema` from
 * `lib/validation/auth.ts` so the "min 8, upper+lower+digit" rule
 * and email-format rule are declared once across the auth surface.
 */
import { z } from "zod";
import { emailSchema, passwordSchema } from "@/lib/validation/auth";

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, { message: "Current password is required" }),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const changeEmailSchema = z.object({
  newEmail: emailSchema,
});
export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;

/**
 * Token shape mirrors the password-reset primitive: 32 bytes of
 * `randomBytes` hex-encoded = 64 chars, `[0-9a-f]+`. Anything else
 * is a malformed link and short-circuits to a 400 `invalid` before
 * we hit the DB.
 */
export const confirmEmailChangeSchema = z.object({
  token: z.string().length(64).regex(/^[0-9a-f]+$/),
});
export type ConfirmEmailChangeInput = z.infer<typeof confirmEmailChangeSchema>;
