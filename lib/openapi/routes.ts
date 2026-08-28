/**
 * Central OpenAPI route declarations.
 *
 * One `registerRoute` call per public endpoint, colocated so the entire API
 * surface is diff-visible in one file. Zod schemas are the same ones the
 * Route Handlers import for validation — the contract can't drift.
 *
 * Non-goals (documented in docs/specs/api-docs.md §Non-goals):
 *   - `/api/test/*` dev seams (must not appear).
 *   - `/api/auth/[...nextauth]` internals (Auth.js owns that surface).
 *   - `/api/logout` (trivial POST → 303; not worth Zod'ing).
 */
import { z } from "zod";
import { registerRoute } from "./registry";
import {
  registerSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
} from "@/lib/validation/auth";

// Response shapes as Zod so the OpenAPI generator can turn them into JSON
// Schemas without a second declaration.

const registerResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    username: z.string(),
  }),
});

const fieldErrorSchema = z.object({
  error: z.object({
    field: z.string(),
    code: z.string(),
    message: z.string().optional(),
  }),
});

const okSchema = z.object({ ok: z.literal(true) });

const okWithEmailSchema = z.object({
  ok: z.literal(true),
  email: z.string().email(),
});

const resetConfirmErrorSchema = z.object({
  error: z.enum(["expired", "invalid", "weak-password"]),
});

registerRoute({
  method: "post",
  path: "/api/register",
  summary: "Create a new user account.",
  description:
    "Hashes the password with argon2id, creates a `User` row, and returns the " +
    "created user without the password hash. Duplicate email/username returns " +
    "a 400 with a field-scoped error code so the client can attach the " +
    "message to the right form input.",
  tags: ["auth"],
  request: registerSchema,
  responses: {
    "201": { description: "User created.", schema: registerResponseSchema },
    "400": { description: "Validation error (duplicate or Zod).", schema: fieldErrorSchema },
  },
});

registerRoute({
  method: "post",
  path: "/api/password-reset/request",
  summary: "Send a password-reset email if the address is registered.",
  description:
    "Always returns 200 { ok: true }, regardless of whether the email exists. " +
    "Anti-enumeration: response, latency, and side effects are indistinguishable " +
    "from the outside. Actual token creation and email dispatch run in `after()`.",
  tags: ["auth"],
  request: passwordResetRequestSchema,
  responses: {
    "200": { description: "Accepted.", schema: okSchema },
  },
});

registerRoute({
  method: "post",
  path: "/api/password-reset/confirm",
  summary: "Consume a password-reset token and set a new password.",
  description:
    "Atomic claim on `PasswordResetToken` — at most one caller wins. Success " +
    "auto-signs in via Auth.js Credentials on the client. Typed error taxonomy: " +
    "`expired` / `invalid` / `weak-password`.",
  tags: ["auth"],
  request: passwordResetConfirmSchema,
  responses: {
    "200": { description: "Password updated.", schema: okWithEmailSchema },
    "400": { description: "Token or password rejected.", schema: resetConfirmErrorSchema },
  },
});
