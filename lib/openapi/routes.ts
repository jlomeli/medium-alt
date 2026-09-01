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
import {
  createArticleSchema,
  updateArticleSchema,
} from "@/lib/validation/article";

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

registerRoute({
  method: "post",
  path: "/api/logout",
  summary: "Sign out the current session.",
  description:
    "Clears the JWT session cookie and issues a 303 to `/`. Both request and " +
    "response bodies are empty — the contract is carried entirely by the " +
    "`Location` and `Set-Cookie` response headers. Safe to call when " +
    "unauthenticated (still clears any stale cookies).",
  tags: ["auth"],
  responses: {
    "303": {
      description:
        "Session cleared. Response body is empty; the browser follows " +
        "the Location header and applies the Set-Cookie deletions.",
      headers: {
        Location: {
          description: "Absolute or root-relative URL to navigate to after logout — always `/`.",
          schema: { type: "string" },
        },
        "Set-Cookie": {
          description:
            "One or more Set-Cookie headers clearing every Auth.js session/csrf/callback " +
            "cookie variant (both the plain and `__Secure-`/`__Host-`-prefixed forms).",
          schema: { type: "string" },
        },
      },
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

// -------- Articles (docs/specs/articles-crud.md § API surface) --------

const authorViewSchema = z.object({
  username: z.string().nullable(),
  name: z.string().nullable(),
});

// Response body is a Tiptap ProseMirror doc — the full JSON is
// non-trivial to express in OpenAPI and the authoritative shape lives
// in `lib/validation/article.ts` (`tiptapDocSchema`), so the response
// contract advertises the `type: "doc"` sentinel + a permissive
// `content` array. The write side uses the strict Zod schema and
// rejects anything outside the allowlist.
const articleBodyDocSchema = z
  .object({
    type: z.literal("doc"),
    content: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .describe("Tiptap ProseMirror doc — see lib/validation/article.ts.");

const articleViewSchema = z.object({
  slug: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  body: articleBodyDocSchema,
  // Slice 4c — cover image fields. Both nullable: `coverImageUrl` is
  // null when no cover has been set; `coverImageAlt` is null when the
  // author left it blank (renderer treats as decorative).
  coverImageUrl: z.string().url().nullable(),
  coverImageAlt: z.string().nullable(),
  published: z.boolean(),
  publishedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  author: authorViewSchema,
});

const articleResponseSchema = z.object({ article: articleViewSchema });

const publicArticleSummarySchema = z.object({
  slug: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  publishedAt: z.string().datetime().nullable(),
});

const articlesListSchema = z.object({
  articles: z.array(publicArticleSummarySchema),
});

registerRoute({
  method: "post",
  path: "/api/articles",
  summary: "Create a new article.",
  description:
    "Author is the signed-in user. Slug is server-generated (kebab title + " +
    "8 hex chars) and immutable after create. `published: true` sets " +
    "`publishedAt = now()` atomically.",
  tags: ["articles"],
  request: createArticleSchema,
  responses: {
    "201": { description: "Article created.", schema: articleResponseSchema },
    "400": { description: "Zod validation error.", schema: fieldErrorSchema },
    "401": { description: "No session cookie.", schema: unauthenticatedSchema },
  },
});

registerRoute({
  method: "get",
  path: "/api/articles/{slug}",
  summary: "Get an article by slug.",
  description:
    "Public for published articles. Drafts are visible only to their author; " +
    "every other caller (signed-in or not) gets 404 — matches the write-side " +
    "anti-enumeration behaviour. Never leaks `authorId`.",
  tags: ["articles"],
  responses: {
    "200": { description: "The article.", schema: articleResponseSchema },
    "404": { description: "No such article, or draft the caller doesn't own.", schema: notFoundSchema },
  },
});

registerRoute({
  method: "patch",
  path: "/api/articles/{slug}",
  summary: "Update an article.",
  description:
    "Author-only. Non-authors get 404 (never 403) — same anti-enumeration " +
    "defense as GET. Toggling `published` false→true sets `publishedAt = now()` " +
    "on the first publish and keeps the original on republish; true→false " +
    "clears both. Slug is immutable.",
  tags: ["articles"],
  request: updateArticleSchema,
  responses: {
    "200": { description: "The updated article.", schema: articleResponseSchema },
    "400": { description: "Zod validation error.", schema: fieldErrorSchema },
    "401": { description: "No session cookie.", schema: unauthenticatedSchema },
    "404": { description: "No such article, or caller is not the author.", schema: notFoundSchema },
  },
});

registerRoute({
  method: "delete",
  path: "/api/articles/{slug}",
  summary: "Delete an article.",
  description:
    "Author-only. Non-authors get 404 (never 403). Response body is empty; " +
    "the contract is carried by the 204 status. Slice 4c: after the SQL " +
    "delete commits, UploadThing files derived from the article's cover + " +
    "inline `image` node srcs are best-effort deleted from storage. The " +
    "cascade is scoped by ownership — only keys uploaded by the deleter " +
    "(tracked in the `Upload` table) are dropped, so copy-pasted URLs " +
    "from another author's article are never affected. Owned keys still " +
    "referenced by any of the deleter's OTHER articles (shared cover " +
    "URL or inline body image) are also kept, so deleting one article " +
    "never breaks a sibling that shares a file. A failure in the " +
    "storage call is logged but does NOT fail the request — the DB row " +
    "is the source of truth.",
  tags: ["articles"],
  responses: {
    "204": {
      description: "Article deleted. Response body is empty.",
    },
    "401": { description: "No session cookie.", schema: unauthenticatedSchema },
    "404": { description: "No such article, or caller is not the author.", schema: notFoundSchema },
  },
});

// -------- Uploads (docs/specs/articles-images.md § Upload endpoint) --------

const uploadResponseSchema = z.object({
  files: z.array(
    z.object({
      url: z.string().url(),
      key: z.string(),
      name: z.string(),
      size: z.number(),
      type: z.string(),
    }),
  ),
});

const uploadConfigSchema = z.object({
  maxBytes: z.number(),
  allowedMimes: z.array(z.string()),
});

const uploadErrorSchema = z.object({
  error: z.enum([
    "unauthenticated",
    "invalid-multipart",
    "no-file",
    "unsupported-media-type",
    "payload-too-large",
    "upload-failed",
  ]),
});

registerRoute({
  method: "post",
  path: "/api/uploadthing",
  summary: "Upload an image (cover or inline).",
  description:
    "Server-side upload proxy. Accepts `multipart/form-data` with a single " +
    "`file` field; auth-gated, MIME-restricted to " +
    "`image/{jpeg,png,webp,gif}`, capped at 5 MB. Returns the persisted " +
    "URL and key. Under `E2E=1`, storage is routed to an in-process stub " +
    "that writes to `test-results/uploads/`; in every other env, storage " +
    "is UploadThing. See docs/specs/articles-images.md § Testing seams.",
  tags: ["uploads"],
  responses: {
    "200": { description: "Uploaded.", schema: uploadResponseSchema },
    "400": { description: "Malformed multipart or missing file field.", schema: uploadErrorSchema },
    "401": { description: "No session cookie.", schema: uploadErrorSchema },
    "413": { description: "File exceeds the 5 MB cap.", schema: uploadErrorSchema },
    "415": { description: "MIME type outside the allowlist.", schema: uploadErrorSchema },
    "500": { description: "Storage backend rejected the upload.", schema: uploadErrorSchema },
  },
});

registerRoute({
  method: "get",
  path: "/api/uploadthing",
  summary: "Upload endpoint constraints.",
  description:
    "Returns the current MIME allowlist and size cap. No auth required — " +
    "this describes what the route accepts, not any user data. Used by " +
    "clients that want to introspect the constraints without doing a probe upload.",
  tags: ["uploads"],
  responses: {
    "200": { description: "Constraints.", schema: uploadConfigSchema },
  },
});

registerRoute({
  method: "get",
  path: "/api/users/{username}/articles",
  summary: "List a user's published articles.",
  description:
    "Public — no session required. Published-only; drafts never leak (even " +
    "for the author-as-caller — this is a public-shape endpoint only). " +
    "Response items are the narrow `PublicArticleSummary` shape: `slug`, " +
    "`title`, `subtitle`, `publishedAt`. Never `body`, never `authorId`, " +
    "never `author`.",
  tags: ["articles"],
  responses: {
    "200": { description: "Published articles for the user.", schema: articlesListSchema },
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
