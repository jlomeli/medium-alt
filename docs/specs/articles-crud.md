# Spec: Articles CRUD (slice 4a of 4)

Tracking: #11
Status: draft
Owner: jlomeli

## Position in the roadmap

Step 4 of the roadmap ("Articles CRUD — Tiptap, drafts vs published,
images") sliced into three PRs:

- **4a — this spec.** Article model + full CRUD + drafts/published +
  author-only edit/delete. Body is a plain textarea. No images.
- **4b — later.** Swap the plain textarea for Tiptap; body storage
  migrates from `String` to `Json`. Read view learns to render Tiptap
  output. Own spec, own PR.
- **4c — later.** UploadThing wiring: cover-image field on Article,
  inline image upload inside the Tiptap toolbar. Own spec, own PR.

This spec is scoped ruthlessly to 4a. Anything Tiptap- or image-shaped
is deferred with a link back here.

## Intent

First non-trivial content resource. Every downstream feature (tags,
feeds, follow, claps, comments) hangs off Article, so this slice ships
the durable shape: identity (slug), ownership (authorId), lifecycle
(draft ↔ published), and the API/UI surface that reads and writes them.
Body is deliberately plain text so this slice reviews as CRUD, not
rich-text.

## User stories

- As a signed-in user, I want to start a new draft at `/articles/new`.
- As the author of a draft, I want to keep editing it at
  `/articles/[slug]/edit` without publishing it yet.
- As the author, I want to publish and unpublish an article — toggling
  its visibility to the public.
- As the author, I want to delete an article and have it disappear from
  everywhere immediately.
- As any visitor (signed in or not), I want to read a published article
  at `/articles/[slug]`.
- As a signed-in user, I want a `/me/articles` page listing my own
  articles (both drafts and published) so I know what I've written.
- As anyone, an unknown slug or a draft I don't own must return a real
  404 — never leak the existence of someone else's draft.

## Acceptance criteria

Each becomes one Playwright test. Grouped by journey.

### Create (`/articles/new` → `POST /api/articles`)

- [ ] Signed-in visitor to `/articles/new` sees a form with title,
  subtitle, body, and a "Publish this article" checkbox (unchecked by
  default).
- [ ] Submitting valid inputs with the checkbox unchecked creates a
  draft and redirects to `/articles/[slug]/edit` with a preview of the
  freshly-generated slug.
- [ ] Submitting valid inputs with the checkbox checked publishes
  immediately and redirects to `/articles/[slug]` (the public read
  view).
- [ ] Signed-out visitor to `/articles/new` is redirected to
  `/login?callbackUrl=%2Farticles%2Fnew`.
- [ ] Missing title returns a field-scoped Zod error inline.
- [ ] Body longer than the max length returns a field-scoped error.

### Read (`/articles/[slug]` → `GET /api/articles/{slug}`)

- [ ] Published article renders title, subtitle, body (preserving
  newlines), author's display name/username, and publishedAt in a
  human-readable form.
- [ ] Draft article shows a "Draft" badge and is visible **only** to
  its author; any other viewer (including signed-out) gets 404.
- [ ] Unknown slug returns 404 rendered as the app's `not-found.tsx`.
- [ ] Author viewing their own article sees an "Edit" link that
  navigates to `/articles/[slug]/edit`; non-authors don't see it.

### Edit (`/articles/[slug]/edit` → `PATCH /api/articles/{slug}`)

- [ ] Author sees the form pre-filled with current title, subtitle,
  body, and published state.
- [ ] Editing the title does NOT change the slug (slug is immutable
  after create).
- [ ] Valid update persists and redirects to `/articles/[slug]` on
  save (still published) or to the same edit page (still draft).
- [ ] Toggling the checkbox from unchecked to checked sets
  `publishedAt = now`; toggling from checked to unchecked clears
  `publishedAt`.
- [ ] Non-author visiting another user's `/articles/[slug]/edit`
  returns 404 (never a 403 — same "does not exist" leak defense).
- [ ] Signed-out visitor to any `/articles/[slug]/edit` is redirected
  to `/login?callbackUrl=%2Farticles%2F<slug>%2Fedit`.

### Delete (`DELETE /api/articles/{slug}`)

- [ ] Author can DELETE via the button on the edit page; row disappears
  from Prisma; subsequent GETs return 404.
- [ ] Non-author DELETE returns 404. Row must NOT be deleted.
- [ ] Unauthenticated DELETE returns 401.

### List (`/me/articles`)

- [ ] Signed-in author sees a table with rows for each of their
  articles — title, published state (Draft / Published), and a link to
  the public URL (for published) or edit URL (for drafts).
- [ ] Another user's articles never appear.
- [ ] Signed-out visitor is redirected to
  `/login?callbackUrl=%2Fme%2Farticles`.

### Public author listing (`GET /api/users/{username}/articles` +
`/profiles/[username]` article section)

- [ ] `GET /api/users/{username}/articles` returns 200 with
  `{ articles: PublicArticleSummary[] }` for a known user. Only
  published articles appear; drafts must never leak (verified even for
  the author-as-caller — this endpoint is public-shape only).
- [ ] Response includes `slug`, `title`, `subtitle`, `publishedAt` per
  article; never `body`, never `authorId`.
- [ ] Empty array is a valid response for a user with no published
  articles (200, not 404).
- [ ] Unknown username returns 404 (not an empty 200 — matches
  `/api/users/{username}` shape).
- [ ] `/profiles/[username]` renders an "Articles" section listing the
  same rows the API returns, each linking to `/articles/{slug}`. No
  drafts appear even when the viewer is the author.

### API contract

- [ ] `POST /api/articles` — 201 with `{ article: { slug, ... } }` on
  success; 400 on Zod fail; 401 unauthenticated.
- [ ] `GET /api/articles/{slug}` — 200 with the article for public
  reads on published rows; 200 with the draft for the author; 404
  otherwise. Never leaks `authorId` for non-authors.
- [ ] `PATCH /api/articles/{slug}` — 200 with the updated article; 400
  on Zod fail; 404 when the caller is not the author; 401
  unauthenticated.
- [ ] `DELETE /api/articles/{slug}` — 204 on success; 404 when the
  caller is not the author; 401 unauthenticated.

### OpenAPI coverage

- [ ] All four endpoints appear in `/api/openapi.json` — enforced by
  the coverage guard from #5.

## Non-goals

- **Rich-text editing.** Textarea only. Tiptap is 4b.
- **Images.** Body is text; no cover image. UploadThing is 4c.
- **Tags.** Not modeled here. Step 5.
- **Feed / discovery.** No global list, no home-page article grid.
  Step 5.
- **Claps.** Step 7.
- **Comments.** Step 8.
- **Editing the slug.** Server-generated once, then immutable. Product
  choice to sidestep redirect-graph complexity.
- **Multi-author articles / drafts sharing.** Single author per row.
- **Article revisions / undo.** No history table.
- **Rate limiting on POST /api/articles.** Same Phase-2 hold as
  the rest of the write surface.

## Data model delta

New `Article` model. Add reverse relation on `User`.

```prisma
model Article {
  id          String    @id @default(cuid())
  slug        String    @unique
  title       String
  subtitle    String?
  body        String    // Plain text for 4a; migrates to Json in 4b.
  published   Boolean   @default(false)
  publishedAt DateTime?
  authorId    String
  author      User      @relation(fields: [authorId], references: [id], onDelete: Cascade)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([authorId])
  @@index([published, publishedAt])
}
```

Add on `User`:

```prisma
articles Article[]
```

Migration: `pnpm db:migrate --name articles-add-article-model`.

### Slug generation

- Kebab-case the title (lowercase, ASCII, non-alphanumeric → `-`,
  collapse consecutive `-`, trim).
- Append `-` + 8 hex characters from `crypto.randomBytes(4)`.
- Truncate the base to 60 chars before appending the suffix to keep the
  whole slug ≤ 80.
- Uniqueness is enforced by the DB `@unique` constraint; collision
  probability at 8 hex chars per user's title is negligible for a
  substrate. A retry loop on `P2002` handles the pathological case.

### Publish semantics

- `published: false, publishedAt: null` — draft.
- First publish sets `publishedAt = now()`. Subsequent republish keeps
  the original `publishedAt`.
- Unpublish clears both `published` and `publishedAt`. Simplest mental
  model; no historical timestamp preserved. If we ever want that later,
  add `firstPublishedAt` and don't clear it — no cost today.

## API surface

| Method | Path                                    | Auth  | Input (Zod)          | Output                                                                              |
| ------ | --------------------------------------- | ----- | -------------------- | ----------------------------------------------------------------------------------- |
| POST   | `/api/articles`                         | Yes   | `CreateArticleInput` | `201 { article: ArticleView }`; `400` `{ error: { field, code, message? } }`; `401` |
| GET    | `/api/articles/{slug}`                  | mixed | —                    | `200 { article: ArticleView }`; `404`                                               |
| PATCH  | `/api/articles/{slug}`                  | Yes   | `UpdateArticleInput` | `200 { article: ArticleView }`; `400`; `404`; `401`                                 |
| DELETE | `/api/articles/{slug}`                  | Yes   | —                    | `204`; `404`; `401`                                                                 |
| GET    | `/api/users/{username}/articles`        | No    | —                    | `200 { articles: PublicArticleSummary[] }`; `404` for unknown username              |

Zod schemas live under `lib/validation/article.ts`.

- `CreateArticleInput` = `{ title, subtitle?, body, published? }` with
  the same field limits as edit.
- `UpdateArticleInput` — partial, at least one field required (same
  pattern as `updateMeSchema`).
- `titleSchema` = `z.string().min(1).max(120)`.
- `subtitleSchema` = `z.string().max(200).optional()`.
- `bodySchema` = `z.string().min(1).max(20_000)`.
- `slug` never appears in an input schema — server-generated only.

`ArticleView` is the public response shape for the full-article endpoints:

```
{
  slug, title, subtitle, body, published, publishedAt,
  createdAt, updatedAt,
  author: { username, name }
}
```

`authorId` is never included in the response — clients can rely on
`author.username` for ownership checks, and the server does the
authoritative check on write paths anyway.

`PublicArticleSummary` is the narrower listing shape used by
`GET /api/users/{username}/articles`:

```
{ slug, title, subtitle, publishedAt }
```

`body`, `author`, timestamps other than `publishedAt`, and `published`
are omitted deliberately — this is a "index card" shape optimised for
list rendering. Full detail requires a follow-up `GET
/api/articles/{slug}`.

## UI surface

- `/articles/new` — server-gate + client form.
- `/articles/[slug]` — server component. Reads Prisma, applies
  visibility (published OR viewer = author). Shows author menu / Draft
  badge / Edit link when applicable.
- `/articles/[slug]/edit` — server-gate + client form. 404 for
  non-authors (never 403).
- `/me/articles` — server component. Table of own articles with status +
  action links.
- `/profiles/[username]` — existing page; gains an "Articles" section
  below the profile header. Server-fetched inside the RSC using the
  same code path `GET /api/users/{username}/articles` uses (shared
  service function) so the on-page render and the public API can't
  drift.

Shared components (`components/articles/`):

- `<ArticleForm>` — used by `/articles/new` and `/articles/[slug]/edit`.
- `<PublishedBadge>` — small "Draft" / "Published on <date>" pill.
- `<ArticleView>` — read view; renders title/subtitle/body/author-line.
  Body is `<pre className="whitespace-pre-wrap">` for now (plain-text,
  newlines preserved). 4b replaces this with the Tiptap renderer.
- `<AuthorLine>` — "by <name (@username)> · <publishedAt>".

Every affordance is `getByRole` / `getByLabel`-reachable. No
`data-testid`.

## Testing seams

None.

## E2E test plan

- `e2e/tests/articles/create.spec.ts` — new form + auth-gate + submit
  paths. `@smoke @regression`
- `e2e/tests/articles/read.spec.ts` — public read, draft visibility,
  404 semantics. `@smoke`
- `e2e/tests/articles/edit.spec.ts` — prefill, save, publish toggle,
  non-author 404. `@regression`
- `e2e/tests/articles/delete.spec.ts` — author-only delete +
  post-delete 404. `@regression`
- `e2e/tests/articles/my-list.spec.ts` — `/me/articles` isolation.
  `@smoke`
- `e2e/api/articles/crud.spec.ts` — the four CRUD endpoints, happy +
  auth + authz. `@smoke @api @regression`
- `e2e/api/articles/user.spec.ts` — public author-listing endpoint;
  published-only, unknown-username, empty-array shape. `@smoke @api`
- `e2e/tests/profile/public.spec.ts` — existing file gains a block
  asserting the "Articles" section renders the same rows the API
  returns.

Fixtures wired as part of this slice:

- `articleFactory` under `e2e/support/factories/article.factory.ts` —
  `.build(overrides)` and `.create(authorId, overrides)` mirroring
  `userFactory`. `.create()` posts to `POST /api/articles` on behalf of
  the currently-authenticated request context.

## Open questions

None — defaults locked in below.
