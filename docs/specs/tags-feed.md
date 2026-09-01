# Spec: Tags + feed (slice 5 of 8)

Tracking: (issue TBD on PR open)
Status: draft
Owner: jlomeli

## Position in the roadmap

Step 5 of the roadmap in
[`docs/architecture.md`](../architecture.md) ("Tags + feed — list,
filter, pagination"). Shipped as a single PR — the surface is small
enough that further slicing costs more than it delivers.

Explicitly deferred to their own slices:

- **Slice 6 — Follow + your-feed.** A follow-based "your feed" is
  step 6 on the roadmap. Nothing in this slice acknowledges the
  concept.
- **Per-tag pages (`/tags/[slug]`).** Redundant with `?tag=` on the
  home feed for v1. Revisit if a link to a "tag landing" URL turns
  out to be a real user need.

## Intent

Ship the first real listing surface. Today the home page is a static
placeholder and there's no way to browse published articles other than
knowing a slug or clicking through from a profile. This slice makes the
app *browsable*: a global latest-articles feed on `/`, filtering by
tag, and a "popular tags" list so a reader has somewhere to click.

It also lands the durable pieces every downstream slice will lean on:
the cursor-pagination shape that "your feed" and any future tag
landing page will reuse, and the `Tag` model that follow-a-tag would
hang off if we ever add it.

## User stories

- As any visitor (signed in or not), I want the home page to show a
  paginated list of the latest published articles so I have something
  to read without knowing anyone's username.
- As a reader, I want a list of popular tags visible on the home page
  so I can jump into a topic I care about.
- As a reader, I want clicking a tag to filter the feed to articles
  with that tag — with a shareable URL.
- As a reader browsing a long feed, I want "load more" (or "next")
  to keep the articles I've already seen at the top and reveal the
  next page below, without jumping me back to the freshest article.
- As an author writing or editing an article, I want to attach a
  small set of tags so my article appears under those tags on the
  feed.
- As an author, I want to see the tags currently on my article when
  I open the editor, and edit them the same way I edit the title.

## Acceptance criteria

Each becomes one Playwright test. Grouped by journey.

### Global feed (`/` → `GET /api/articles`)

- [ ] Any visitor to `/` sees a list of the latest published articles,
      newest first (by `publishedAt`), rendered as cards linking to
      `/articles/[slug]`. Each card shows title, subtitle,
      author's display name/username, `publishedAt`, and any attached
      tags.
- [ ] Drafts never appear on the feed — including for the author who
      wrote them.
- [ ] With more than `limit` published articles in the DB, the first
      page returns exactly `limit` cards and a "Next" affordance;
      clicking "Next" reveals the following page. Repeated clicks
      surface stable, non-overlapping pages until exhausted.
- [ ] When there are no more articles, the "Next" affordance
      disappears (or is disabled). No infinite spinner.
- [ ] A tag chip on any card links to `/?tag=<slug>` and filters the
      feed to articles carrying that tag. The URL is shareable —
      landing on `/?tag=<slug>` directly renders the same filtered
      feed.
- [ ] Filtering by an unknown tag renders an empty state ("No articles
      yet under `<slug>`") — never a 404.
- [ ] Empty DB renders an empty state ("No articles yet") — not a
      broken layout.

### Popular tags (`GET /api/tags`)

- [ ] The home page shows a "Popular tags" list with the top N tags
      by published-article count, in descending count order (ties
      broken by tag name, ascending).
- [ ] Only published articles contribute to the count. A tag attached
      exclusively to drafts must not appear.
- [ ] A tag with zero published articles never appears in the
      popular-tags list. (The tag row can exist — orphan cleanup is
      §Non-goals — but the popular-tags surface hides it.)

### Author-side tag input (extends `POST` / `PATCH /api/articles[/{slug}]`)

- [ ] Author on `/articles/new` sees a "Tags" input alongside title,
      subtitle, body. Submitting with tags creates the article and
      the tags appear on its card in the feed.
- [ ] Editing an article at `/articles/[slug]/edit` shows its current
      tags pre-filled; saving with a modified list replaces the tag
      set (add + remove atomic — no stale association).
- [ ] Tags are normalised server-side: trimmed, lowercased, split
      into slugs (`Software Testing` → `software-testing`). Duplicates
      within one submission collapse. Empty entries are dropped.
- [ ] Tags cap at **5 per article** and each tag slug caps at **30
      characters**. Over-cap submissions return a field-scoped 400.
- [ ] Slug normalisation to the empty string (e.g. `"---"`, `"!!!"`)
      returns a field-scoped 400 — never silently drops.
- [ ] Reusing an existing tag (same normalised slug as one already in
      the DB) does not create a duplicate row; the article joins the
      existing `Tag`.

### API contract

- [ ] `GET /api/articles` — 200 with
      `{ items: PublicArticleSummary[], nextCursor: string | null }`.
      `items.length ≤ limit`. `nextCursor === null` iff the current
      page was the last.
- [ ] `GET /api/articles?tag=<slug>` — same shape, filtered to
      articles carrying that tag. Unknown tag returns 200 with
      `{ items: [], nextCursor: null }` (not 404).
- [ ] `GET /api/articles?cursor=<opaque>` — resumes from the cursor.
      A **structurally invalid** cursor (not base64url JSON, missing
      `p`/`i`, `p` unparseable as a Date) returns 400
      `{ error: { field: "cursor", code: "invalid" } }`, not 500.
- [ ] A **stale** cursor (structurally valid, but the anchor article
      has since been deleted) is not a 400 — the tuple compare
      `(publishedAt, id) < (cursor.p, cursor.i)` returns the correct
      set of older articles whether the anchor row still exists or
      not, so an existence check would only add a per-request DB
      round trip without changing the response. Same trade as offset
      pagination against a mutating dataset.
- [ ] `GET /api/articles?limit=<n>` — accepts `1..50`; out-of-range
      returns 400.
- [ ] `GET /api/tags` — 200 with `{ tags: [{ slug, name, count }] }`,
      sorted by count desc / slug asc. Accepts `?limit=` (default
      20, cap 50).
- [ ] `POST /api/articles` with `tags: ["Foo", "Bar"]` — 201; response
      includes the normalised tag list.
- [ ] `PATCH /api/articles/{slug}` with `tags: [...]` — 200; the
      article's tag set is replaced with the provided list.
      Omitting the field leaves tags unchanged (partial-update
      semantics, same as the other fields).
- [ ] `PATCH /api/articles/{slug}` with `tags: []` — 200; explicitly
      clears the tag set.

### PublicArticleSummary — extension

- [ ] The `PublicArticleSummary` shape returned by `/api/articles`
      and by the existing `/api/users/{username}/articles` gains a
      `tags: string[]` field (tag slugs, alphabetically sorted for
      deterministic diffs). Both endpoints return the same shape —
      they share the same select via `lib/articles/service.ts`.

### OpenAPI coverage

- [ ] Both new endpoints (`GET /api/articles`, `GET /api/tags`) and
      the extended request/response shapes on
      `POST /api/articles` and `PATCH /api/articles/{slug}` appear in
      `/api/openapi.json` — enforced by the coverage guard from #5.

## Non-goals

- **Follow-based "your feed".** Step 6 on the roadmap; no follow
  concept exists yet in this slice.
- **Per-tag landing pages (`/tags/[slug]`).** The `?tag=` filter on
  `/` covers the read experience. Revisit if there's a real need
  for a permalink shape distinct from the query string.
- **A global "all tags" browse page.** Popular-tags list only. If
  we ever want an A–Z index we can add it as its own thin slice.
- **Full-text search / free-text query on the feed.** Filter is
  tag-only. Search is a future slice or a Phase-2 concern.
- **Sort order controls.** Newest-first only. No "popular this week",
  no author sort.
- **Tag rename / merge / delete admin tooling.** No admin surface
  ships in this slice; orphan tags stay in the DB.
- **Orphan-tag cleanup.** A tag whose last article is deleted or
  unpublished stays as a row with count 0. Invisible to the
  popular-tags surface either way; not worth the write-path cost
  or the cascading-delete surprise.
- **Tag colour, description, or icon.** `slug` + `name` only.
- **Rate limiting on `GET /api/articles`.** Same Phase-2 hold as the
  rest of the surface.
- **Offset pagination.** Cursor-only. See § Pagination.

## Data model delta

New `Tag` model + implicit many-to-many join with `Article`.

```prisma
model Tag {
  id       String    @id @default(cuid())
  slug     String    @unique
  name     String
  articles Article[]

  createdAt DateTime @default(now())

  @@index([slug])
}
```

Add on `Article`:

```prisma
tags Tag[]
```

Implicit many-to-many (Prisma-managed `_ArticleToTag` join) rather than
an explicit join model — no per-association metadata (added-by,
added-at) is needed for this slice, and the implicit form keeps write
paths a single `set: [{ id }, …]` connect call.

Migration: `pnpm db:migrate --name tags-add-tag-model`.

### Tag normalisation

- Trim, lowercase, replace `[^a-z0-9]+` with `-`, collapse consecutive
  `-`, strip leading/trailing `-`.
- If the result is the empty string, that entry is a 400 (see
  Acceptance criteria) — never silently dropped. Silent drop would
  make "why isn't my tag showing up?" impossible to debug.
- `slug` is the storage / lookup key. `name` is the trimmed original
  the author typed (first writer wins — if two authors type `Testing`
  and `testing`, the display name is whichever landed first). Good
  enough for v1; a "canonical display name" is Phase 2.
- Live in `lib/tags/slug.ts` alongside a `parseTagInput(input): string[]`
  that accepts either a `string[]` or a comma-separated `string` from
  the form and returns the normalised, deduplicated, empty-checked slug
  list — the single source of truth used by both API routes and the
  form.

### Pagination

Cursor-based, on `(publishedAt desc, id desc)` — the `id` is a
deterministic tiebreaker for the rare case that two articles publish
in the same millisecond.

- `cursor` is base64url-encoded JSON: `{ p: <publishedAt ISO>, i: <articleId> }`.
  Opaque to the client; the shape is an implementation detail we're
  free to change later.
- `limit` defaults to **20**, capped at **50**. Small enough to keep
  the SSR payload snappy, large enough that "load more" doesn't feel
  jittery.
- Query: `WHERE published = true AND (publishedAt, id) < (cursor.p, cursor.i)`
  (compound tuple compare) `ORDER BY publishedAt DESC, id DESC LIMIT ?`.
  The existing `@@index([published, publishedAt])` covers the ordering;
  the `id` tiebreaker is negligible.
- `nextCursor` is derived from the last returned row. When fewer than
  `limit` rows come back, `nextCursor === null`.
- Rationale over offset: stable across concurrent inserts. Offset
  duplicates or skips rows when new articles publish while a reader is
  paging.

## API surface

| Method | Path                                     | Auth  | Input (Zod)               | Output                                                                                       |
| ------ | ---------------------------------------- | ----- | ------------------------- | -------------------------------------------------------------------------------------------- |
| GET    | `/api/articles`                          | No    | `?tag=&cursor=&limit=`    | `200 { items: PublicArticleSummary[], nextCursor: string \| null }`; `400`                   |
| GET    | `/api/tags`                              | No    | `?limit=`                 | `200 { tags: PopularTag[] }`; `400`                                                          |
| POST   | `/api/articles` **(extended)**           | Yes   | `CreateArticleInput`      | `201 { article: ArticleView }`; `400`; `401`                                                 |
| PATCH  | `/api/articles/{slug}` **(extended)**    | Yes   | `UpdateArticleInput`      | `200 { article: ArticleView }`; `400`; `404`; `401`                                          |

Zod schemas: new `feedQuerySchema` and `tagsQuerySchema` under
`lib/validation/feed.ts`; `tagsSchema = z.array(z.string()).max(5)`
added to `lib/validation/article.ts` and pulled into both
`createArticleSchema` and `updateArticleSchema`. Server calls
`parseTagInput` on the raw input before insert to apply normalisation.

`PublicArticleSummary` (existing, extended):

```
{ slug, title, subtitle, publishedAt, tags: string[], author: { username, name } }
```

- `tags` is a sorted string array of tag slugs (deterministic diffs
  in tests and OpenAPI examples).
- `author` is added to the summary in this slice — the global feed
  needs it, and adding it once here beats a second endpoint. The
  existing `/api/users/{username}/articles` gains it too; it's
  additive, no client breaks.

`PopularTag`:

```
{ slug: string, name: string, count: number }
```

`ArticleView` (existing, extended): gains `tags: string[]` (sorted
slugs) so the read page can render the tag chips without a second
round-trip.

### Error shape

All 400s use the existing `{ error: { field, code, message? } }`
shape from slice 4a. New codes:

- `cursor` field: `invalid` (malformed or references a deleted row).
- `limit` field: `out-of-range` (below 1 or above cap).
- `tags` field: `too-many`, `too-long`, `empty` (an entry normalised
  to `""`).

## UI surface

- `/` — server component. Reads Prisma via the shared feed service,
  renders a list of `<ArticleCard>` plus a `<PopularTags>` sidebar.
  Accepts `?tag=<slug>` and `?cursor=<opaque>` from the URL.
- `/articles/new`, `/articles/[slug]/edit` — existing `<ArticleForm>`
  gains a `<TagsInput>` field.
- `/articles/[slug]` — existing read view learns to render tag chips
  under the author line, each linking to `/?tag=<slug>`.
- No new dedicated route lands in this slice.

Shared components (`components/articles/` + `components/feed/`):

- `<ArticleCard>` — feed row: title, subtitle, author line, `publishedAt`,
  tag chips. Links to `/articles/[slug]`.
- `<FeedList>` — client component wrapping `<ArticleCard>` cards + a
  `<LoadMore>` button that navigates to `?cursor=<next>` (server-driven
  pagination — no client fetch state to reason about).
- `<PopularTags>` — sidebar list; each entry links to `/?tag=<slug>`.
- `<TagChip>` — small pill; used on cards, read view, and sidebar.
- `<TagsInput>` — comma-separated input in the editor form; on blur it
  parses via a client-side mirror of `parseTagInput` so the author sees
  the normalised tags they'll actually store.

Every affordance is `getByRole` / `getByLabel`-reachable. No
`data-testid`.

## Testing seams

None. The feed and popular-tags endpoints are pure reads over data
the tests seed via the existing `articleFactory`; nothing here needs
an env-gated back door.

## Seed impact

Extend `prisma/seeds/baseline.ts` to attach a small set of tags to the
existing seeded articles — enough that a `pnpm db:seed`'d local DB
lands on a `/` with cards, tag chips, and a non-empty popular-tags
list on first look.

Suggested distribution (~4 tags total, boring on purpose):

- `writing`, `intro`, `editor`, `reading`.
- Alice's three published articles: `writing`, `intro`, `editor`.
- Bob's two published articles: `reading`, `intro`.

Same idempotency contract as the rest of the seed: findUnique-by-slug
on `Tag`, connect on the article create path.

The CI drift check (`pnpm db:seed` step from
[`docs/specs/dev-seed.md`](dev-seed.md) § CI wiring) automatically
catches any schema-tag mismatch introduced by this slice.

## E2E test plan

- `e2e/tests/feed/home.spec.ts` — home feed renders newest-first,
  empty state, tag-chip click flows into `?tag=`. `@smoke @regression`
- `e2e/tests/feed/pagination.spec.ts` — `limit`, "next" resumes with
  stable non-overlapping pages, "next" disappears at the end.
  `@regression`
- `e2e/tests/feed/tag-filter.spec.ts` — known-tag filter, unknown-tag
  empty state, popular-tags sidebar links. `@smoke`
- `e2e/tests/articles/tags-editor.spec.ts` — create with tags, edit
  tags (add/remove/replace/clear), normalisation preview, cap
  enforcement in the form. `@regression`
- `e2e/api/feed/articles.spec.ts` — `GET /api/articles` happy path,
  `?tag=` filter, cursor round-trip, `limit` bounds, invalid cursor
  400. `@smoke @api @regression`
- `e2e/api/feed/tags.spec.ts` — `GET /api/tags` happy path,
  draft-only-tag excluded from popular list, `?limit=` cap.
  `@smoke @api`
- `e2e/api/articles/tags.spec.ts` — POST/PATCH with `tags`,
  normalisation, dedup, cap, empty-string-after-normalisation 400,
  `PATCH tags: []` clears. `@api @regression`

Fixture wired as part of this slice:

- `tagFactory` under `e2e/support/factories/tag.factory.ts` — optional
  helper for building an ad-hoc `Tag`; most tests will attach tags via
  `articleFactory.create(authorId, { tags: [...] })` (the factory
  gains a `tags` override this slice).

## Open questions

None — recommendations were confirmed before drafting. Concrete
values (default limit, per-tag/per-article caps, seed tag choices)
are implementation defaults and stay editable during code.
