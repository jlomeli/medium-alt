# Spec: Comments (slice 8 of 8)

Tracking: #23
Status: draft
Owner: jlomeli

## Position in the roadmap

Step 8 of the roadmap in
[`docs/architecture.md`](../architecture.md) ("Comments"). The last
v1 slice. Ships as a single PR — the surface is one model, three
endpoints, one field on the shared listing shape, one form, one
list, and one item component. Slicing "post comments" from "delete
comments" would leave both halves feeling half-shipped and give the
review agent nothing meaningful to grade.

Explicitly deferred to their own slices or Phase 2 (see § Non-goals
for the full list):

- **Nested replies / threading.** Flat list only. A `parentId`
  self-relation on `Comment` and the depth/collapse UI to render
  it are a whole story worth their own spec.
- **Editing an existing comment.** Comments are immutable in v1;
  delete-and-repost if you regret one.
- **Reactions / claps on comments.** No secondary engagement
  metric on a comment.
- **Pagination.** All comments for an article render on the read
  page. A cap-and-paginate story lands in Phase 2 if a demo
  article ever accumulates 1k+ comments.
- **Moderation surface.** Article authors cannot delete comments
  on their own articles in v1 — only the comment's own author
  can. See § Delete permissions.
- **Notifications when someone comments on your article.** No
  notification surface exists in v1 (see
  `docs/architecture.md` § Scope).
- **Rate limiting on the comment endpoint.** Phase-2 hold, same as
  the rest of the write surface.
- **Realtime comment updates** (someone else posts while you
  read). No websockets in v1. The list is a snapshot per render;
  reload — or post one yourself, which triggers a
  `router.refresh()` — to see other viewers' contributions.

## Intent

Ship the first *discussion* surface, closing v1. Slice 7 (Claps)
introduced weighted, per-reader quantitative engagement; comments
introduce free-text, per-reader qualitative engagement. The two
sit next to each other on the read page and share the same "signed
in? write. anonymous? gated to login. author? no self-{clap,
comment} branch" shape — the auth-gate patterns Follow (slice 6)
and Claps (slice 7) established get one more validation run before
v1 closes.

It also lands the durable pieces any Phase-2 discussion surface
(threading, reactions, moderation) will lean on:

- A `commentCount` aggregate on the shared `PublicArticleSummary`
  shape so cards in Global, Your Feed, tag pages, and profiles
  render the count without a second round-trip — matched
  shape-for-shape with the `clapCount` field slice 7 added.
- A `commentCount` on the full `ArticleView` for the read page,
  in the same slot on the response as `clapCount`.
- A shared `lib/comments/service.ts` module — same pattern as
  `lib/claps/service.ts` and `lib/follows/service.ts` — so both
  the Route Handler and the RSC read the comment list through
  one code path and can't drift.

Unlike Claps, comments deliberately **do not** use an optimistic
client. A comment post is a durable content event that a user
expects to acknowledge — a spinner-then-append reads honest here;
a "your comment appeared then disappeared on server error" reads
alarming. `useOptimistic` is available if a Phase-2 review
disagrees; today the spec says server action + `router.refresh()`.

## User stories

- As a signed-in reader on `/articles/[slug]`, I want to type a
  comment into a text area at the bottom of the article and
  submit it, then see my comment appear at the end of the
  chronological list without leaving the page.
- As the same reader, I want to delete a comment I posted (I
  fat-fingered the send key, or I regret my take) directly from
  the comment card, without navigating anywhere.
- As the same reader, I want to see comments render oldest-first,
  top-to-bottom, so the conversation reads like a conversation
  and I don't have to scroll up to follow context.
- As an anonymous visitor on `/articles/[slug]`, I want to see
  the existing comments (they're a public part of the article
  page) but see a "Sign in or sign up to leave a comment"
  affordance in place of the form, so the write path is obvious
  and gated. Clicking it routes me to
  `/login?callbackUrl=/articles/<slug>` — same pattern as the
  Follow and Clap anonymous branches.
- As the author of an article, I want to comment on my own
  article (unlike claps and follows, self-comment is a real
  concept — "PS, I forgot to add X" is a genuine use case), so
  the form renders for me too.
- As the author of an article, I can only delete my own comments
  — including on my own article. I cannot moderate other
  people's comments on my article in v1.
- As anyone browsing Global, Your Feed, a tag page, or a
  profile's article list, I want a comment count on each card
  so I can spot articles that generated discussion at a glance
  without opening every one.
- As a screen-reader user, I want the comment list to be a
  landmarked region I can jump to, the comment form's textarea
  to be properly labelled, and each comment card's delete
  button (when present) to have an accessible name that
  identifies which comment it deletes.

## Acceptance criteria

Each becomes one Playwright test. Grouped by journey.

### Comment list + form on the article read page (`/articles/[slug]`)

- [ ] Signed-in visitor on any *published* article sees the
      comment list (oldest-first, empty state renders `"No
      comments yet — be the first."`), and below it a comment
      form: a labelled textarea `"Write a comment"` and a submit
      button `"Post comment"`.
- [ ] Submitting the form with a non-empty body appends the
      comment to the bottom of the list (chronological append),
      clears the textarea, and returns focus to the textarea for
      the next comment. The new comment shows the viewer's
      display name, avatar, and a relative timestamp
      (`"just now"`).
- [ ] Submitting the form with an empty body (or whitespace-only)
      surfaces an inline `getByRole("alert")` message
      `"Comment can't be empty."` and does not create a comment.
      Client-side + server-side; the server-side check is what
      the API test exercises, the UI test asserts the message.
- [ ] Submitting a body longer than 2000 characters surfaces
      an inline `getByRole("alert")` `"Comment is too long
      (max 2000 characters)."` and does not create a comment.
- [ ] Reloading the read page after posting shows the same
      comment in the same slot in the list. State is derived
      from the DB, not from client memory.
- [ ] A signed-in visitor viewing a comment they wrote sees a
      Delete button on that comment's card, with accessible
      name `"Delete your comment posted <timestamp>"`. Comments
      they did not write render no Delete button (not disabled
      — absent from the DOM).
- [ ] Clicking Delete on the viewer's own comment removes it
      from the list without a page reload. The comment count on
      the section header decrements. Reloading confirms it is
      gone from the DB.
- [ ] Anonymous visitor on any article sees the comment list
      but no form. In the form's place: a `<Link>` reading
      `"Sign in or sign up to leave a comment."` pointing to
      `/login?callbackUrl=/articles/<slug>`. No POST fires from
      the anonymous DOM.
- [ ] Signed-in author viewing their **own** *published*
      article sees the same form everyone else does (self-
      comment is allowed). Comments they post themselves render
      the same Delete affordance any comment author gets.
- [ ] Draft articles never render a comment section (drafts are
      visible to their author only, and even the author can't
      comment on a draft — the article isn't published yet).
      The comment count field on the draft's `ArticleView` is
      always `0`.

### Comment count on feed cards + section header

- [ ] `<ArticleCard>` renders the article's comment count inline
      on the byline row, next to the clap count (e.g. `"by
      Alice · Aug 1 · ♥ 12 · 💬 3"` — glyph conventions
      confirmed at commit time). Renders across Global (`/`),
      Your Feed (`/?feed=me`), tag filter (`/?tag=<slug>`), and
      the profile article section (`/profiles/[username]`). The
      number is the same aggregate the read page shows.
- [ ] A card with 0 comments renders `"💬 0"` (or the confirmed
      icon-plus-zero convention), not a hidden field. Same
      consistency call the clap-count field made in slice 7.
- [ ] The comment section on the read page has a heading
      `"Comments (N)"` where `N` is the count. When the viewer
      posts a comment, `N` increments; when they delete their
      own, `N` decrements. The heading is a landmark
      (`role="heading"`, level 2) so screen-reader users can
      jump to it.

### API contract

- [ ] `GET /api/articles/{slug}/comments` — anyone (auth
      optional), article exists and is published → 200
      `{ items: Comment[] }`, oldest-first
      (`ORDER BY createdAt ASC, id ASC` — id is the stable
      tiebreak). Each `Comment` carries `{ id, body, createdAt,
      author: { username, name, image } }`.
- [ ] `GET /api/articles/{slug}/comments` — article slug
      unknown OR article is a draft not owned by the caller →
      404 `{ error: "not-found" }`. (Drafts do not leak: same
      "404, never 403" rule from articles-crud slice 4a.)
      Author asking for comments on their own draft → 200
      `{ items: [] }` — the author *can* GET, they just find
      the list empty because posting to a draft is forbidden
      (see the POST 404 rule below).
- [ ] `POST /api/articles/{slug}/comments` — signed-in, article
      exists and is published, body valid → 201 `Comment`. A row
      is created in `Comment`.
- [ ] `POST /api/articles/{slug}/comments` — signed-in, body is
      empty / whitespace-only / longer than 2000 characters
      after trim → 400 `{ error: { field: "body", code:
      "out-of-range" } }`. No row is created.
- [ ] `POST /api/articles/{slug}/comments` — anonymous → 401
      `{ error: "unauthenticated" }`.
- [ ] `POST /api/articles/{slug}/comments` — signed-in, article
      slug unknown OR article is a draft (whether or not the
      caller owns it) → 404 `{ error: "not-found" }`. (Even the
      author can't comment on their own draft. Rationale: a
      draft is unpublished by definition — a comment on it has
      no reader audience. Once published, the author is free
      to comment.)
- [ ] `DELETE /api/articles/{slug}/comments/{id}` — signed-in,
      comment exists, viewer is the comment's author → 204
      (empty body). The row is deleted.
- [ ] `DELETE /api/articles/{slug}/comments/{id}` — signed-in,
      comment exists, viewer is NOT the comment's author → 403
      `{ error: "forbidden" }`. No row is deleted. Rationale for
      403 (vs 404): the comment's existence is already
      public via `GET /comments`, so 403 leaks nothing new.
      Distinct from the article-draft case, which stays 404 for
      privacy.
- [ ] `DELETE /api/articles/{slug}/comments/{id}` — signed-in,
      comment id unknown for this article slug → 404
      `{ error: "not-found" }`. (Applies to a valid comment id
      that belongs to a *different* article too: the `{slug}`
      in the URL is authoritative — a comment id addressed
      against the wrong article's slug is a 404, not a 403.)
- [ ] `DELETE /api/articles/{slug}/comments/{id}` — anonymous →
      401 `{ error: "unauthenticated" }`.
- [ ] `GET /api/articles/{slug}` — response `article` object
      now includes `commentCount: number` (aggregate,
      `COUNT(*)` across all comments on the article) in the
      same slot as the slice-7 `clapCount` field.
- [ ] `GET /api/articles` and `GET /api/feed` and
      `GET /api/users/{username}/articles` — every
      `PublicArticleSummary` in the response now carries
      `commentCount: number`. No `viewer` block on the summary
      shape (no `viewer.hasCommented` — same rationale as
      slice 7 declined `viewer.hasClapped` on the summary:
      per-card viewer state is a materialisation cost with
      zero read paths in v1).

### OpenAPI coverage

- [ ] All three new endpoints (`GET /api/articles/{slug}/comments`,
      `POST /api/articles/{slug}/comments`,
      `DELETE /api/articles/{slug}/comments/{id}`) appear in
      `/api/openapi.json` — enforced by the coverage guard from
      slice 4a / #5.
- [ ] The updated `ArticleView` and `PublicArticleSummary`
      schemas in `/api/openapi.json` reflect the new
      `commentCount` field.
- [ ] A new `Comment` schema (id, body, createdAt, author sub-
      shape) appears in `/api/openapi.json` and is referenced
      from the GET/POST response shapes.

## Non-goals

- **Nested replies / threading.** No `parentId` self-relation on
  `Comment`. A depth-collapse UI, the parent-chain query, and
  the "reply to reply to reply" rendering are a Phase-2 spec.
- **Editing an existing comment.** Immutable in v1. Delete-and-
  repost is the only path. Sidesteps an `"edited"` badge, an
  edit-history audit trail, and the "can the article author see
  edits after you posted" conversation.
- **Reactions / claps on comments.** No secondary engagement
  metric on a comment. Would re-open the claps model discussion
  for a second surface.
- **Pagination on the comment list.** All comments render.
  Cap-and-paginate lands in Phase 2 if a demo article ever
  accumulates 1k+ comments.
- **Moderation by the article author.** Article authors cannot
  delete other people's comments on their own articles in v1.
  Adding this needs a moderation-audit conversation (do we
  record who removed what? do we soft-delete with a "removed
  by author" tombstone?) that's its own slice.
- **Reporting / flagging.** No `Report` model, no admin queue.
  Same admin-role hold that keeps the moderation surface out.
- **Comment counts on the profile header** (e.g. "your articles
  have received 42 comments total"). Aggregation surface, own
  slice if it earns one.
- **Anonymous comment that "sticks" until login** (deferred
  write). Anonymous click on the sign-in prompt → redirect to
  `/login`, callbackUrl brings them back, but no comment is
  written pre- or post-login. Same trade-off Follow and Claps
  made.
- **Rich text in comments.** Comment `body` is plain text. No
  Tiptap, no Markdown, no `<a>` autolinking. The comment column
  is `String` (`Text` in Postgres), rendered with `whitespace-
  pre-wrap`. Simple, XSS-free by construction, no editor bundle
  on the read page.
- **Realtime comment updates.** No revalidation-on-someone-
  else's-comment. The list is a snapshot per render.
- **Rate limiting on `POST /comments`.** Phase-2 hold.
- **Optimistic append.** See § Intent — the durable-content
  event reads better with a spinner than a flash-then-revert.

## Data model delta

New `Comment` model — one row per comment, indexed for the two
natural queries (list-by-article ordered by time, list-by-author
for a future "your comments" surface).

```prisma
model Comment {
  id        String   @id @default(cuid())
  articleId String
  article   Article  @relation(fields: [articleId], references: [id], onDelete: Cascade)
  authorId  String
  author    User     @relation(fields: [authorId], references: [id], onDelete: Cascade)
  body      String   @db.Text
  createdAt DateTime @default(now())

  @@index([articleId, createdAt, id])
  @@index([authorId])
}
```

Add on `User`:

```prisma
comments Comment[]
```

Add on `Article`:

```prisma
comments Comment[]
```

Migration: `pnpm db:migrate --name comments-add-comment-model`.

### Why a single `body: String` column instead of structured content

- The v1 comment column is plain text (see § Non-goals — no rich
  text). `String` maps to `Text` in Postgres, uncapped at the DB
  level; the 2000-character cap is enforced in the Zod schema so
  a confused client sees a shaped 400 rather than a Postgres
  error.
- No `updatedAt` field: comments are immutable (see § Non-goals),
  so a mutation timestamp would only ever equal `createdAt` and
  invites a "why does the API expose two identical timestamps"
  question at review time.

### Why the `@@index([articleId, createdAt, id])` composite index

- The read path (list all comments for one article, ordered
  chronologically) is a single `WHERE articleId = ? ORDER BY
  createdAt ASC, id ASC` — the three-column composite index
  matches the filter + full sort order (including the `id`
  tiebreak) in one seek, no in-memory sort even on rows sharing
  a `createdAt` microsecond.
- `id` is the tiebreak on `createdAt` (cuids are lexicographically
  sortable and monotonically increasing enough for a stable
  order on the microsecond-collision case). The index carries
  `id` as its trailing column so the tiebreak is index-covered
  — same reason the feed's index on `publishedAt DESC, id DESC`
  carries `id`, not just `publishedAt`.

### Why `authorId` cascades

- A deleted user's comments vanish alongside their articles and
  claps — matches the existing user cascade shape. A comment
  attributed to a `"[deleted user]"` tombstone is a scope-creep
  UI story not worth v1 complexity.
- Same cascade decision `Clap.userId` made in slice 7.

### Delete permissions

- **Comment author only.** The DELETE handler resolves the
  comment, then asserts `comment.authorId === session.user.id`;
  any other caller gets 403. Simplest permission model,
  mirrors "you own your writes" from articles and claps.
- Article-author moderation and admin roles are explicit
  Phase-2 holds (see § Non-goals). Adding them later is an
  additive permission check in the same route — no schema
  change.

## API surface

| Method | Path                                          | Auth | Input (Zod)         | Output                                                                        |
| ------ | --------------------------------------------- | ---- | ------------------- | ----------------------------------------------------------------------------- |
| GET    | `/api/articles/{slug}/comments`               | No   | *(none)*            | `200 { items: Comment[] }`; `404`                                             |
| POST   | `/api/articles/{slug}/comments`               | Yes  | `CreateCommentInput`| `201 Comment`; `400`; `401`; `404`                                            |
| DELETE | `/api/articles/{slug}/comments/{id}`          | Yes  | *(none)*            | `204`; `401`; `403`; `404`                                                    |

Zod schemas live under `lib/validation/comment.ts`:

- `CreateCommentInput = { body: string }` where `body`, after
  `.trim()`, is `1 ≤ length ≤ 2000`. Empty / whitespace / too-long
  → 400 `{ error: { field: "body", code: "out-of-range" } }`.

Response shapes:

- `Comment = { id: string; body: string; createdAt: string; author:
  { username: string | null; name: string | null; image: string
  | null } }`. Nullability tracks the `User` model
  (`username`, `name`, and `image` are each `String?` in
  `prisma/schema.prisma`), matching the same-typed
  `PublicArticleSummary.author` contract from slice 4a; the
  extra `image` field is a superset — feed cards don't need an
  avatar, comment cards do. Deliberately does **not** carry
  `authorId` — an internal user id is not part of the public
  API and would fingerprint accounts across responses.
- `commentCount` on `ArticleView` and `PublicArticleSummary`:
  `number` (nonnegative integer).

Internally, `lib/comments/service.ts` also exposes a
`CommentWithAuthorship = Comment & { authorId: string }` shape
that the RSC on `/articles/[slug]` consumes directly (never
crossing the API boundary). This is the shape `<CommentItem>` gets
and the shape used for the `session.user.id === comment.authorId`
ownership check that gates the delete affordance — a stable id
comparison, not a username string compare that could false-match
across a rename in a future slice. `GET /api/articles/{slug}/
comments` projects `CommentWithAuthorship` down to the public
`Comment` before serializing.

### Error shape

All 400 / 401 / 403 / 404 reuse the shapes already in use across
the API:

- 401 → `{ error: "unauthenticated" }` (literal string, matches
  the clap and follow routes).
- 403 → `{ error: "forbidden" }` (literal string). New in this
  slice — no prior route has needed 403 because privacy rules
  collapsed those cases to 404. Comments break the tie: the
  comment id is publicly readable via GET, so 403 is honest and
  leaks nothing.
- 404 → `{ error: "not-found" }` (literal string).
- 400 → `{ error: { field, code, message? } }` (field-scoped,
  from slice 4a). New codes:
  - `body` field: `out-of-range` (see `CreateCommentInput`
    above).

### Additive shape changes

- `PublicArticleSummary` (in `lib/articles/service.ts`) gains
  `commentCount: number`. Every listing that produces this
  shape (`GET /api/articles`, `GET /api/feed`,
  `GET /api/users/{username}/articles`, and the RSC-side
  `/profiles/[username]` render) receives it via the same
  aggregate call described below in § Read path — parallel to
  the `sumClapsForArticles` treatment slice 7 landed.
- `ArticleView` (in `lib/articles/view.ts`) gains
  `commentCount: number` unconditionally. No `viewer` block
  addition — see below.
- **No `viewer.hasCommented`** on either shape. Rationale: the
  presence of the viewer's own comment is already discoverable
  from the comment list itself (the RSC compares
  `session.user.id === comment.authorId` on the internal
  `CommentWithAuthorship` shape — see § Response shapes), so a
  redundant aggregate would only invite drift.

## Read path — how counts + lists get on the responses

Three reads, all centralised in `lib/comments/service.ts`:

- `listCommentsForArticle(articleId: string):
  Promise<CommentWithAuthorship[]>` — single `findMany` with
  `orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]` and an
  `include: { author: { select: publicAuthorSelect } }`. Returns
  the internal `CommentWithAuthorship` shape (carries
  `authorId`); called by the RSC on `/articles/[slug]` directly
  and by `GET /api/articles/{slug}/comments`, which projects
  each row down to the public `Comment` before serializing.
- `countCommentsForArticles(articleIds: string[]): Promise<Map<string,
  number>>` — one `groupBy articleId, _count: { _all: true }` call
  shaped into a Map keyed by article id. Called from every listing
  (`listPublishedArticlesByUsername`, `listPublishedFeed`) so the
  summary rows are enriched in a single round-trip. Empty input
  returns an empty Map (no DB call). Mirrors `sumClapsForArticles`
  from slice 7.
- `countCommentsForArticle(articleId: string): Promise<number>` —
  the single-article aggregate for `ArticleView.commentCount`. A
  single `count` call; used by `GET /api/articles/{slug}` in
  parallel with the existing viewer-clap-state lookup.

For the single-article `GET /api/articles/{slug}` path, the route
now runs three reads in parallel with `Promise.all`: article body,
viewer clap state (if signed in), and this comment count. No N+1
on either the read page or the feed paths.

### Write path

Comment writes are single-row inserts / deletes — no arithmetic,
no race, no `FOR UPDATE`. The service wraps them for testability
but doesn't need a transaction:

- `createComment(authorId, articleId, body):
  Promise<CommentWithAuthorship>` — one `prisma.comment.create({
  data: { authorId, articleId, body }, include: { author: {
  select: publicAuthorSelect } } })`. Returns the internal
  `CommentWithAuthorship` shape (see § Response shapes): the row
  columns plus the nested `author` sub-object, ready for the RSC
  or ready to be projected down to the public `Comment` by the
  POST route before serializing. The default `create` (without
  the `include`) would return `{ id, body, createdAt, authorId,
  articleId }` — flat row columns, no nested `author` — which
  is the wrong shape for both callers and would leak the
  internal `articleId` scalar; the explicit `include` +
  down-projection at the HTTP boundary is what keeps the wire
  shape honest. The 400 for empty/too-long body is Zod's job
  upstream; the "no comments on drafts (even own)" 404 is the
  caller's job (see § UI surface / `<CommentForm>` step 4 for
  the server action, and the same check on the POST route
  handler). The service assumes the article has already been
  resolved *and* verified `publishedAt != null`, and lets Prisma
  surface any DB-level violation (there is none — the column is
  `Text`).

`publicAuthorSelect` is a new local constant in
`lib/comments/service.ts` — a Prisma `select` object of
`{ username: true, name: true, image: true }` matching the
`Comment.author` sub-shape. Not shared with `lib/articles/`
service (which projects a narrower `{ username, name }` inline
for its own listing shape); prematurely hoisting a shared
projection would couple two independently-evolving read paths.
- `deleteComment(commentId, callerId): Promise<void>` — a
  `findUniqueOrThrow` on the id (surfaces to 404 at the route),
  then an authorship check (surfaces to 403), then a `delete`.
  The route confirms the comment's `articleId` matches the
  `{slug}` in the URL before calling the service — a mismatched
  slug is a 404.

## UI surface

- `/articles/[slug]` — server component (existing). Learns to
  render the new `<CommentsSection>` below the article body,
  passing the article's `id` and `slug` plus the current
  session.
- No new routes land in this slice.

New components (`components/comments/`):

- `<CommentsSection>` — server component. Reads
  `listCommentsForArticle` and the current session, renders the
  section heading `"Comments (N)"`, a `<CommentList>` of
  `<CommentItem>` cards, and — conditional on session — either
  a `<CommentForm>` or a `<SignInToComment>` prompt.
  Landmark: `role="region"` with an aria-labelledby pointing at
  the heading.
- `<CommentList>` — server component. Pure map over
  `<CommentItem>`; renders the empty-state text when the list
  is empty. Split from `<CommentsSection>` so the item mapping
  is testable in isolation and so a Phase-2 "load more" story
  can wrap it without touching the section shell.
- `<CommentItem>` — server component. Receives one
  `CommentWithAuthorship` (the internal shape carrying
  `authorId` — see § Response shapes) plus the current
  `session.user.id` (or `null` when anonymous). Renders the
  card: author avatar + display name (linked to
  `/profiles/[username]`), relative timestamp, body (wrapped in
  a `<p className="whitespace-pre-wrap">` — plain text, no
  markup interpretation). Ownership gate is a stable-id compare
  `session?.user.id === comment.authorId` (never a username
  string compare — a username rename in a future slice would
  silently strip the delete affordance). When the gate passes,
  renders a `<DeleteCommentButton>` child (client component).
- `<CommentForm>` — client component,
  `<CommentForm slug={string} />`. Wraps a `<form
  action={boundAction}>` where `boundAction` is
  `postComment.bind(null, slug)` — the `slug` is captured into
  the action's closure at the render site so it does not have
  to travel through `formData` and cannot be forged by a client
  editing the DOM. `postComment` itself is a server action
  exported from `app/articles/[slug]/actions.ts` with the
  signature required by React 19's `useActionState`:

  ```ts
  type PostCommentState =
    | { status: "idle" }
    | { status: "success"; submittedAt: number }
    | { status: "error"; error: {
        field: "body" | "slug";
        code: "out-of-range" | "not-found"
          | "unauthenticated";
        message?: string;
      } };

  async function postComment(
    slug: string,
    _prevState: PostCommentState,
    formData: FormData,
  ): Promise<PostCommentState>;
  ```

  With `postComment.bind(null, slug)` the framework-supplied
  arguments (`prevState`, `formData`) line up in the second and
  third positions — the order `useActionState` guarantees. A
  fresh `submittedAt` timestamp on the success state gives the
  client a stable value to `key` the `<textarea>` off, which is
  how the field is cleared without an imperative `ref.reset()`
  (a state-derived reset survives React's concurrent-render
  reordering).

  The action runs server-side and does **not** make an internal
  HTTP call to its own POST endpoint (that would need
  session-cookie forwarding and a deployment-safe absolute URL,
  both Vercel-preview footguns). Instead it:
  1. Reads the session via `auth()` imported from
     `@/lib/auth/config` — the canonical auth module used by
     every other RSC and route handler in the repo (`app/page.tsx`,
     `app/articles/[slug]/page.tsx`,
     `app/api/articles/[slug]/claps/route.ts`, etc.). A null
     session returns `{ status: "error", error: { field: "body",
     code: "unauthenticated" } }` (the anonymous DOM never
     renders `<CommentForm>` in the first place, so this branch
     is belt-and-braces — see § UI surface /
     `<CommentsSection>`).
  2. Parses the `formData.get("body")` payload with
     `CreateCommentInput` from `lib/validation/comment.ts`; a
     Zod failure returns `{ status: "error", error: { field:
     "body", code: "out-of-range" } }` — the client renders the
     `error.message` in its `role="alert"` slot.
  3. Resolves the article via the shared
     `resolveArticleForCaller` helper (unknown slug → 404;
     draft not owned by the caller → 404). Note the helper
     *returns* an owned draft — that's what makes the edit-my-
     draft path work — so it alone is **not** sufficient here.
  4. Rejects a resolved draft with a shaped 404 error even when
     the caller owns it (`article.publishedAt == null` →
     `{ status: "error", error: { field: "slug", code:
     "not-found" } }`). This matches the POST route contract
     that all drafts, including own drafts, return 404 — an
     unpublished article has no reader audience for a comment.
     The POST route handler applies the same check against the
     same helper for the same reason, so the two write paths
     cannot drift.
  5. Calls `createComment(authorId, articleId, body)` from
     `lib/comments/service.ts` — the same service function the
     POST route handler uses.
  6. `revalidatePath('/articles/' + slug)` on success so the RSC
     re-renders the list with the new row.
  7. Returns `{ status: "success", submittedAt: Date.now() }`.

  The client wraps this action with `useActionState` (React 19;
  the older `useFormState` name is a compatibility alias) and
  `useFormStatus` for the pending / error / cleared states.
  Renders:
  - the `<textarea>` with `key={state.status === "success" ?
    state.submittedAt : "draft"}` — a new `key` on success
    remounts the field to an empty value, and a `useEffect` on
    the same `submittedAt` calls `textareaRef.current?.focus()`;
  - a `role="alert"` sibling that renders the shaped
    `state.error.message` (or a code-to-copy lookup) when
    `state.status === "error"`;
  - the submit button labeled `"Post comment"`, disabled while
    `useFormStatus().pending`.

  The POST route handler still exists (and covers the same
  behavior — the API tests exercise it), but the UI path is
  action → service, not UI → HTTP → service.
- `<DeleteCommentButton>` — client component,
  `<DeleteCommentButton slug={string} commentId={string}
  postedAt={string} />`. Renders a `<button>` with accessible
  name `"Delete your comment posted <relative time>"`. Click →
  DELETE → `router.refresh()` on 204, or `role="alert"` on
  failure.
- `<SignInToComment>` — server component,
  `<SignInToComment slug={string} />`. Renders a `<Link>` (not
  a `<button>`) pointing to
  `/login?callbackUrl=/articles/<slug>`. Server-rendered link
  pattern matching `<FollowButton variant="anonymous">` and
  `<ClapButton variant="anonymous">` from slices 6 and 7 — no
  optimistic-click JS ships in the anonymous DOM.
- `<CommentCount count={number} />` — pure display, shared by
  `<CommentsSection>`'s heading and `<ArticleCard>`'s byline
  row so the "0 → dim? show a bubble?" convention flips in one
  place. Mirrors `<ClapCount>` from slice 7.

`<ArticleCard>` (existing, `components/articles/`) — gains a
`commentCount` prop and renders it inline on the byline row,
next to `clapCount`. Client-agnostic — the card stays a pure
display component.

Every affordance is `getByRole` / `getByLabel`-reachable. No
`data-testid`. The textarea's accessible name is `"Write a
comment"`; the submit button's is `"Post comment"`; the delete
button's is `"Delete your comment posted <relative time>"`.

## Testing seams

None. `Comment` rows are seeded through the same authenticated
`APIRequestContext` the follow/article/clap factories already
use, with a `commentFactory.create(readerApi, slug, body?)` helper
that POSTs to `/api/articles/{slug}/comments`. A
`commentFactory.delete(ownerApi, slug, id)` helper wraps the
symmetric DELETE. No env-gated back door needed.

The form path submits through a Next.js server action, not a
client-side `fetch`, so `page.route()` cannot cleanly intercept
the write to force a synthetic 500. That's fine — the shaped-
error render path is already covered by the empty-body and
too-long-body ACs (both drive the same `useFormState` error
slot the client renders). A `page.route()` intercept on
`DELETE /api/articles/{slug}/comments/{id}` remains available
for the delete-error test if one lands in a future slice
(`<DeleteCommentButton>` is a client component doing a
same-origin fetch).

## Seed impact

Extend `prisma/seeds/baseline.ts` so on a fresh `pnpm db:seed`:

- **Bob posts a comment on Alice's "Welcome to Medium-Alt"**
  reading `"Great intro — looking forward to the next one!"`
- **Alice replies with a comment of her own** on the same
  article: `"Thanks Bob! Slice 2 lands next week."` (Self-
  comment is a real story in v1 — see § User stories.)

That gives every read-page and feed-card demo a non-zero
comment count out of the box, and gives Bob a comment he owns
so the "delete your own comment" story is demoable without a
manual post round.

Idempotency: `findFirst` on `(articleId, authorId, body)` then
`create` if absent. Comments don't have a composite unique key
(a user is free to post twice), so the seed dedupes on the
content triple; on second run the existing rows are left
untouched and reported as `skipped` by the `BaselineSummary`.

The CI drift check (`pnpm db:seed` step from
[`docs/specs/dev-seed.md`](dev-seed.md) § CI wiring)
automatically catches any schema-comment mismatch introduced by
this slice.

## E2E test plan

- `e2e/tests/comments/comment-form.spec.ts` — happy path:
  signed-in reader on another user's article posts a comment,
  sees it appended, reloads, sees it persist. Empty-body and
  too-long-body inline validation. Self-comment by the author
  works. `@smoke @regression`
- `e2e/tests/comments/delete-comment.spec.ts` — comment author
  sees Delete on their own comment and not on others'; click
  removes it without a page reload; other viewers refresh and
  see it gone. `@regression`
- `e2e/tests/comments/anonymous.spec.ts` — anonymous visitor
  sees the list, sees the "Sign in or sign up to leave a
  comment" prompt in place of the form, and clicking it lands
  on `/login?callbackUrl=/articles/<slug>`. No POST fires.
  `@smoke @regression`
- `e2e/tests/comments/counts-on-cards.spec.ts` — comment count
  renders on `<ArticleCard>` across Global, Your Feed, tag
  filter, and profile listings. Reads the seed's non-zero
  article for a real number rather than always `0`.
  `@regression`
- `e2e/api/comments/comments.spec.ts` — GET happy + 404
  (unknown slug + others' draft); POST happy + empty/too-long
  400 + anonymous 401 + unknown/draft 404 + own-draft 404;
  DELETE happy + non-owner 403 + wrong-slug 404 + unknown-id
  404 + anonymous 401. `@smoke @api @regression`
- `e2e/api/comments/article-view.spec.ts` — `GET
  /api/articles/{slug}` contains `commentCount`; the value
  matches the length of the GET-comments response.
  `@smoke @api`
- `e2e/api/comments/summary-shape.spec.ts` — `GET
  /api/articles`, `GET /api/feed`, and `GET /api/users/
  {username}/articles` all include `commentCount` on every
  summary row, and no `viewer` block appears on any summary.
  `@regression @api`

Fixture wired as part of this slice:

- `commentFactory` under `e2e/support/factories/comment.factory.ts`
  — `.create(readerApi, slug, body?)` POSTs to
  `/api/articles/{slug}/comments`. `.delete(ownerApi, slug,
  id)` for the symmetric clear. No `.build()` — a comment
  with no article is meaningless.

## Open questions

None — the three genuine forks (delete permissions, sort order,
scope of v1 features) were confirmed before drafting. Cosmetic
values (glyph character on the byline row, exact empty-state
copy, exact "sign in" prompt copy) are implementation defaults
and stay editable during code review.
