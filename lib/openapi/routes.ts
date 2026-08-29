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
  loginSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
} from "@/lib/validation/auth";
import { updateMeSchema } from "@/lib/validation/profile";

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

const loginResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    username: z.string().nullable(),
  }),
});

const invalidCredentialsSchema = z.object({
  error: z.literal("invalid-credentials"),
});

registerRoute({
  method: "post",
  path: "/api/login",
  summary: "Sign in with email + password.",
  description:
    "First-party JSON wrapper over Auth.js Credentials sign-in. Success sets " +
    "the session cookie and returns the user's public shape. Failure returns " +
    "`invalid-credentials` for both wrong-password and unknown-email — the " +
    "response body is byte-identical across the two paths (anti-enumeration).",
  tags: ["auth"],
  request: loginSchema,
  responses: {
    "200": { description: "Signed in.", schema: loginResponseSchema },
    "400": { description: "Zod validation error.", schema: fieldErrorSchema },
    "401": { description: "Wrong password or unknown email.", schema: invalidCredentialsSchema },
  },
});

const logoutRedirectSchema = z.object({});
registerRoute({
  method: "post",
  path: "/api/logout",
  summary: "Sign out the current session.",
  description:
    "Clears the JWT session cookie and issues a 303 to `/`. Body is empty on " +
    "both sides. Safe to call when unauthenticated (still clears any stale " +
    "cookies).",
  tags: ["auth"],
  responses: {
    "303": {
      description: "Session cleared; browser follows redirect to /.",
      schema: logoutRedirectSchema,
    },
  },
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

// -------- Profile --------

const meResponseSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  username: z.string().nullable(),
  name: z.string().nullable(),
  bio: z.string().nullable(),
});

const publicProfileSchema = z.object({
  username: z.string().nullable(),
  name: z.string().nullable(),
  bio: z.string().nullable(),
});

const unauthenticatedSchema = z.object({ error: z.literal("unauthenticated") });
const notFoundSchema = z.object({ error: z.literal("not-found") });

registerRoute({
  method: "get",
  path: "/api/me",
  summary: "Get the signed-in user's profile.",
  description:
    "Returns the caller's own profile row. Includes fields that are private to " +
    "the user (`email`) alongside public ones. Requires an authenticated session.",
  tags: ["profile"],
  responses: {
    "200": { description: "The current user's profile.", schema: meResponseSchema },
    "401": { description: "No session cookie.", schema: unauthenticatedSchema },
  },
});

registerRoute({
  method: "patch",
  path: "/api/me",
  summary: "Update the signed-in user's profile.",
  description:
    "Partial update — every field is individually optional, but the payload " +
    "must include at least one. Duplicate username emits the same field/code " +
    "shape as POST /api/register so client wiring is symmetric.",
  tags: ["profile"],
  request: updateMeSchema,
  responses: {
    "200": { description: "The updated profile.", schema: meResponseSchema },
    "400": {
      description: "Validation error (Zod or unique-constraint collision).",
      schema: fieldErrorSchema,
    },
    "401": { description: "No session cookie.", schema: unauthenticatedSchema },
  },
});

registerRoute({
  method: "get",
  path: "/api/users/{username}",
  summary: "Get a user's public profile.",
  description:
    "Public — no session required. Response body is deliberately narrow: " +
    "`username`, `name`, `bio`. Never `email` or `id`.",
  tags: ["profile"],
  responses: {
    "200": { description: "The user's public profile.", schema: publicProfileSchema },
    "404": { description: "Unknown username.", schema: notFoundSchema },
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
