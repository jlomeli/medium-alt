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
import { addClapsSchema } from "@/lib/validation/claps";
import { createCommentSchema } from "@/lib/validation/comment";

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
// Slice 8 — first appearance of 403 in the API. Comments' delete
// endpoint returns it for the non-owner case; the comment id is
// publicly readable via GET so 403 leaks nothing new (see
// docs/specs/comments.md § Error shape).
const forbiddenSchema = z.object({ error: z.literal("forbidden") });

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

// Slice 7 — the per-viewer clap block. Appears on `articleViewSchema`
// only when the caller is authenticated (see docs/specs/claps.md §
// API contract — "the viewer block is omitted, not null, for
// anonymous callers"). `.optional()` here encodes exactly that
// present-vs-absent contract; OpenAPI's `required` list therefore
// excludes `viewer`.
const viewerClapSchema = z.object({
  clapCount: z.number().int().min(0).max(50),
  hasClapped: z.boolean(),
});

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
  // Slice 5 — sorted tag slugs. Sorted server-side for deterministic
  // OpenAPI examples + test diffs.
  tags: z.array(z.string()),
  // Slice 7 — aggregate + optional per-viewer clap state. See
  // docs/specs/claps.md § API contract.
  clapCount: z.number().int().nonnegative(),
  // Slice 8 — aggregate comment count. Unconditional, present on
  // every ArticleView (0 for drafts and never-commented articles).
  commentCount: z.number().int().nonnegative(),
  viewer: viewerClapSchema.optional(),
});

const articleResponseSchema = z.object({ article: articleViewSchema });

const publicArticleSummarySchema = z.object({
  slug: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  publishedAt: z.string().datetime().nullable(),
  // Slice 5 — additive on this summary. The global feed needs an
  // author byline on each card, and the existing per-user listing
  // gains both fields for free (no client breaks; clients that
  // ignore unknown keys are unaffected).
  tags: z.array(z.string()),
  author: authorViewSchema,
  // Slice 7 — aggregate clap count on every card. No viewer block on
  // this shape (read-page-only affordance); see docs/specs/claps.md §
  // API contract.
  clapCount: z.number().int().nonnegative(),
  // Slice 8 — aggregate comment count on every card. Same "no viewer
  // block on summaries" discipline as `clapCount`.
  commentCount: z.number().int().nonnegative(),
});

const feedResponseSchema = z.object({
  items: z.array(publicArticleSummarySchema),
  nextCursor: z.string().nullable(),
});

const popularTagSchema = z.object({
  slug: z.string(),
  name: z.string(),
  count: z.number().int().nonnegative(),
});
const tagsResponseSchema = z.object({ tags: z.array(popularTagSchema) });

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
    "is the source of truth. On a rejected storage delete the matching " +
    "`Upload` rows are kept, so the still-present file retains its " +
    "durable ownership pointer for a reconciliation / retry job.",
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

// -------- Feed + tags (docs/specs/tags-feed.md) --------

registerRoute({
  method: "get",
  path: "/api/articles",
  summary: "Global published-articles feed.",
  description:
    "Public — no session required. Drafts never appear, including for " +
    "the author-as-caller. Cursor pagination on `(publishedAt DESC, " +
    "id DESC)`; `nextCursor` is `null` when the returned page was the " +
    "last. Filter to a single tag with `?tag=<slug>`; unknown tag " +
    "returns 200 with an empty items array (not 404 — same UX story as " +
    "an empty DB). `limit` defaults to 20, capped at 50.",
  tags: ["articles"],
  responses: {
    "200": { description: "One page of the feed.", schema: feedResponseSchema },
    "400": { description: "Malformed cursor / out-of-range limit.", schema: fieldErrorSchema },
  },
});

registerRoute({
  method: "get",
  path: "/api/tags",
  summary: "Popular tags.",
  description:
    "Public — no session required. Returns the top N tags by count of " +
    "*published* articles carrying the tag, count descending, ties " +
    "broken by slug ascending. A tag whose only articles are drafts " +
    "never appears. `limit` defaults to 20, capped at 50.",
  tags: ["articles"],
  responses: {
    "200": { description: "Popular tags.", schema: tagsResponseSchema },
    "400": { description: "Out-of-range limit.", schema: fieldErrorSchema },
  },
});

registerRoute({
  method: "get",
  path: "/api/users/{username}/articles",
  summary: "List a user's published articles.",
  description:
    "Public — no session required. Published-only; drafts never leak (even " +
    "for the author-as-caller — this is a public-shape endpoint only). " +
    "Response items are the `PublicArticleSummary` shape: `slug`, " +
    "`title`, `subtitle`, `publishedAt`, `tags`, `author`. Never `body`, " +
    "never `authorId`.",
  tags: ["articles"],
  responses: {
    "200": { description: "Published articles for the user.", schema: articlesListSchema },
    "404": { description: "Unknown username.", schema: notFoundSchema },
  },
});

// -------- Follow + Your Feed (docs/specs/follow.md) --------

const followResponseSchema = z.object({
  following: z.literal(true),
  followedAt: z.string().datetime(),
});

registerRoute({
  method: "post",
  path: "/api/users/{username}/follow",
  summary: "Follow a user.",
  description:
    "Idempotent: 201 on the first successful call, 200 on any repeat " +
    "after the follow already exists. Response body is byte-identical " +
    "in both cases — clients that ignore the status code still see the " +
    "same shape. Self-follow is rejected with a field-scoped 400 " +
    "(`self-follow`). Unknown target → 404.",
  tags: ["follow"],
  responses: {
    "200": { description: "Already following (idempotent repeat).", schema: followResponseSchema },
    "201": { description: "Follow created.", schema: followResponseSchema },
    "400": { description: "Attempting to follow yourself.", schema: fieldErrorSchema },
    "401": { description: "No session cookie.", schema: unauthenticatedSchema },
    "404": { description: "Unknown username.", schema: notFoundSchema },
  },
});

registerRoute({
  method: "delete",
  path: "/api/users/{username}/follow",
  summary: "Unfollow a user.",
  description:
    "Idempotent: 204 whether or not a follow row existed. Deleting a " +
    "non-existent relationship is not an error — symmetric to POST's " +
    "'already followed → 200 with same body'. Unknown target is still " +
    "a 404 (a bad URL is a client error, not idempotency territory).",
  tags: ["follow"],
  responses: {
    "204": { description: "Unfollowed (or was never following)." },
    "401": { description: "No session cookie.", schema: unauthenticatedSchema },
    "404": { description: "Unknown username.", schema: notFoundSchema },
  },
});

registerRoute({
  method: "get",
  path: "/api/feed",
  summary: "Your Feed — published articles from authors you follow.",
  description:
    "Auth-required. Response shape is identical to `GET /api/articles` " +
    "so a client that paginates the global feed can point at this " +
    "route with no code changes. Cursor pagination on " +
    "`(publishedAt DESC, id DESC)`; `nextCursor` is `null` when the " +
    "returned page was the last. Viewer following nobody → 200 with " +
    "an empty items array (not 404). The viewer's own articles are " +
    "always excluded, even if a self-follow row somehow exists.",
  tags: ["follow"],
  responses: {
    "200": { description: "One page of Your Feed.", schema: feedResponseSchema },
    "400": { description: "Malformed cursor / out-of-range limit.", schema: fieldErrorSchema },
    "401": { description: "No session cookie.", schema: unauthenticatedSchema },
  },
});

// -------- Claps (docs/specs/claps.md § API surface) --------

const clapResponseSchema = z.object({
  viewerCount: z.number().int().min(0).max(50),
  totalCount: z.number().int().nonnegative(),
});

registerRoute({
  method: "post",
  path: "/api/articles/{slug}/claps",
  summary: "Add claps to an article.",
  description:
    "Idempotent up to the 50-clap-per-viewer cap: 201 on the first row " +
    "created for the viewer, 200 on any subsequent write (including the " +
    "cap-hit no-op). `delta` is optional; a missing / empty body means " +
    "`{ delta: 1 }` — the natural per-click cadence. When the cap " +
    "intervenes the response reflects the *actual* counts, not the " +
    "requested delta. Anti-enumeration: an unknown slug and a draft the " +
    "caller doesn't own collapse to the same 404. Self-clap (the author " +
    "clapping their own article) → field-scoped 400 `self-clap`, " +
    "matching the `self-follow` shape.",
  tags: ["claps"],
  request: addClapsSchema,
  responses: {
    "200": { description: "Updated (idempotent repeat or cap-hit).", schema: clapResponseSchema },
    "201": { description: "First clap by this viewer.", schema: clapResponseSchema },
    "400": {
      description:
        "`delta` out of range, or the caller is the article's author.",
      schema: fieldErrorSchema,
    },
    "401": { description: "No session cookie.", schema: unauthenticatedSchema },
    "404": {
      description: "No such article, or a draft the caller doesn't own.",
      schema: notFoundSchema,
    },
  },
});

registerRoute({
  method: "delete",
  path: "/api/articles/{slug}/claps",
  summary: "Clear the caller's clap contribution to an article.",
  description:
    "Idempotent: 204 whether or not a row existed. Removes the caller's " +
    "entire Clap row for the article — there's no `-1`-per-click semantic " +
    "(matches Medium's UX, and dodges the 'which of my N claps am I " +
    "removing' question). Unknown slug / non-visible draft is still a " +
    "404 (client-error territory, not idempotency).",
  tags: ["claps"],
  responses: {
    "204": { description: "Cleared (or was never clapped)." },
    "401": { description: "No session cookie.", schema: unauthenticatedSchema },
    "404": {
      description: "No such article, or a draft the caller doesn't own.",
      schema: notFoundSchema,
    },
  },
});

// -------- Comments (docs/specs/comments.md § API surface) --------

const commentAuthorSchema = z.object({
  username: z.string().nullable(),
  name: z.string().nullable(),
  image: z.string().nullable(),
});
const commentSchema = z.object({
  id: z.string(),
  body: z.string(),
  createdAt: z.string().datetime(),
  author: commentAuthorSchema,
});
const commentsListSchema = z.object({ items: z.array(commentSchema) });

registerRoute({
  method: "get",
  path: "/api/articles/{slug}/comments",
  summary: "List comments on an article, oldest first.",
  description:
    "Public for published articles. Draft visibility: an unknown slug " +
    "or a draft the caller doesn't own → 404 (same anti-enumeration " +
    "shape). The author asking for comments on their own draft → 200 " +
    "with an empty list (the write path rejects posts to drafts).",
  tags: ["comments"],
  responses: {
    "200": { description: "Comments, oldest first.", schema: commentsListSchema },
    "404": {
      description: "No such article, or a draft the caller doesn't own.",
      schema: notFoundSchema,
    },
  },
});

registerRoute({
  method: "post",
  path: "/api/articles/{slug}/comments",
  summary: "Post a comment on a published article.",
  description:
    "Signed-in only. Body is plain text, 1..2000 chars after trim. " +
    "Drafts (including the caller's own drafts — self-comment on a " +
    "draft is meaningless) return 404, matching the read side.",
  tags: ["comments"],
  request: createCommentSchema,
  responses: {
    "201": { description: "Comment created.", schema: commentSchema },
    "400": {
      description: "Body empty / whitespace / too long.",
      schema: fieldErrorSchema,
    },
    "401": { description: "No session cookie.", schema: unauthenticatedSchema },
    "404": {
      description:
        "No such article, or a draft (including the caller's own draft).",
      schema: notFoundSchema,
    },
  },
});

registerRoute({
  method: "delete",
  path: "/api/articles/{slug}/comments/{commentId}",
  summary: "Delete one of your own comments.",
  description:
    "Signed-in, comment-author only. Article-author moderation is out " +
    "of scope for v1 — even the article's author gets 403 on someone " +
    "else's comment. 403 is honest here (rather than 404-for-privacy): " +
    "the comment id is publicly readable via GET, so 403 leaks nothing " +
    "new. Wrong (slug, commentId) pairing → 404.",
  tags: ["comments"],
  responses: {
    "204": { description: "Comment deleted." },
    "401": { description: "No session cookie.", schema: unauthenticatedSchema },
    "403": {
      description: "Caller is not the author of the comment.",
      schema: forbiddenSchema,
    },
    "404": {
      description:
        "Unknown comment id, or the id doesn't belong to the given article.",
      schema: notFoundSchema,
    },
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
