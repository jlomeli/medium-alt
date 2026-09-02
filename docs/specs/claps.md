# Spec: Claps — optimistic UI (slice 7 of 8)

Tracking: #20
Status: draft
Owner: jlomeli

## Position in the roadmap

Step 7 of the roadmap in
[`docs/architecture.md`](../architecture.md) ("Claps — optimistic
UI"). Ships as a single PR — the surface is one model, two
endpoints, one field on the shared listing shape, one button, and
one aggregate read. Further slicing would trade a clean
"engagement metric + optimistic client" review for two half-slices
neither of which stands on its own.

Explicitly deferred to their own slices or Phase 2:

- **Slice 8 — Comments.** Nothing in this slice touches
  discussion, only quantitative engagement. The `viewer` state
  shape introduced here (`viewer.hasClapped`, `viewer.clapCount`)
  is intentionally shaped so a `viewer.hasCommented` sibling
  slots in without a schema change.
- **Notifications when someone claps for your article.** No
  notification surface exists in v1 (see
  `docs/architecture.md` § Scope).
- **Per-clap timestamps ("who clapped when").** The `Clap` row
  carries an aggregate `count` per `(userId, articleId)` pair
  plus a single `updatedAt`, not one row per clap. See
  § Data model delta.
- **Rate limiting on the clap endpoint.** Same Phase-2 hold as
  the rest of the write surface.
- **Realtime clap-count updates** (someone else claps while you
  read). No websockets in v1. Count is snapshot-per-render;
  reload to see other viewers' contributions.

## Intent

Ship the first *engagement* surface. Follow (slice 6) established
a directed relationship between users; Claps establishes a
weighted, per-article signal — how much a specific reader liked
what they read. Medium-style multi-clap (1–50 per reader per
article) is deliberate: a single "favorite" would reduce to a
Follow reskin and give the optimistic-UI substrate nothing to
show off. A rapid-tap increment path is the whole reason this
slice earns its own spot on the roadmap — it's the first
interaction in the app where the network round-trip is slower
than the user's next action, and the framework needs a real
example of "hand the user the next frame immediately, reconcile
with the server behind them."

It also lands the durable pieces slice 8 (Comments) and any
future engagement-quality surface will lean on:

- A `clapCount` aggregate on the shared `PublicArticleSummary`
  shape so cards in Global, Your Feed, and the profile all render
  the count without a second round-trip.
- A `viewer.clapCount` / `viewer.hasClapped` block on the full
  `ArticleView` for the read page, matched shape-for-shape with
  what a `viewer.hasCommented` would look like.
- A shared `lib/claps/service.ts` module — same pattern as
  `lib/follows/service.ts` — so both the Route Handler and the
  RSC read the count through one code path and can't drift.

## User stories

- As a signed-in reader on `/articles/[slug]`, I want to tap a
  Clap button to give the article one clap and see the count
  jump *immediately* — before the server has answered — so the
  UI feels as fast as my finger.
- As the same reader, I want to keep tapping to add more claps,
  up to 50 per article, so I can express "I really liked this"
  without a separate 5-star widget.
- As the same reader, at 50 claps I want the button to make it
  visible that I've hit my cap — the count stops going up and
  the button reads accordingly — so I stop tapping.
- As the same reader, I want the total-clap count on the article
  to reflect everyone's claps (mine + other readers'), separate
  from my own contribution, so I can tell what the article's
  reception is without confusing it with what I gave it.
- As the same reader, if the network drops mid-tap, I want the
  optimistic count to *revert* to the server-truth value and the
  button to surface an inline error, so I'm never lied to about
  what actually saved.
- As an anonymous visitor, I want to see the total-clap count on
  every article and feed card (it's a public number) but clicking
  the Clap button should route me to `/login` — the same auth-gate
  pattern the Follow button uses.
- As anyone browsing Global, Your Feed, a tag page, or a
  profile's article list, I want the clap count on each card so
  I can spot popular articles at a glance without opening every
  one.
- As the author of an article, I want to see the clap count on
  my own article's read page, but clicking Clap on my own
  article does nothing (silently — no button to nag me about) —
  self-clapping isn't a real concept, same as self-follow.

## Acceptance criteria

Each becomes one Playwright test. Grouped by journey.

### Clap button on the article read page (`/articles/[slug]`)

- [ ] Signed-in visitor on another user's *published* article
      sees a "Clap" button showing the article's total clap
      count (`0` for a never-clapped article, aggregated across
      all readers otherwise). Clicking it flips the count to
      total+1 **before** any network round-trip completes.
- [ ] After the server response settles, the button label reads
      `"Clapped (1)"` and reflects the viewer's own clap count
      as `1`; the article's total-clap number also shows the
      +1 (viewer contribution included in the total).
- [ ] Clicking N times (N ≤ 50) in rapid succession bumps the
      optimistic count by N synchronously; after the server has
      caught up, both the viewer count (`Clapped (N)`) and the
      total count reconcile to the truth. The final on-screen
      count matches what a page reload would show.
- [ ] Clicking a 51st time at the 50-clap cap is a no-op: the
      count doesn't budge (optimistic UI respects the cap), no
      extra network call fires, and the button visibly signals
      cap-reached (`"Clapped (50 / 50)"` or equivalent —
      implementation detail confirmed at commit time).
- [ ] If the server returns an error to a clap POST (500 mocked
      via network stub in the test), the optimistic count
      *reverts* to the pre-click value and an inline
      `getByRole("alert")` surfaces
      `"Couldn't save your clap — please try again."` The
      button stays enabled.
- [ ] Reloading the read page after clapping surfaces the
      button in the same "Clapped (N)" state and the same total
      count. State is derived from the DB, not from client
      memory.
- [ ] Signed-in author viewing their **own** article: the total
      clap count renders, but the Clap button is absent from
      the DOM entirely (not disabled). Self-clapping isn't a
      concept; matches the self-follow decision from slice 6.
- [ ] Anonymous visitor on any article sees a Clap button whose
      click routes them to
      `/login?callbackUrl=/articles/<slug>`. No clap row is
      created. Matches the anonymous-Follow pattern in slice 6.
- [ ] Draft articles never render a Clap button (drafts are
      visible to their author only, and the author can't clap
      for themselves — the intersection is empty).

### Clap counts on feed cards

- [ ] `<ArticleCard>` renders the article's total clap count
      inline on the byline row (e.g. `"by Alice · Aug 1 · ♥ 12"`)
      across Global (`/`), Your Feed (`/?feed=me`), tag filter
      (`/?tag=<slug>`), and the profile article section
      (`/profiles/[username]`). The number is the same aggregate
      the read page shows.
- [ ] A card with 0 claps renders `"♥ 0"` (or the confirmed
      icon-plus-zero convention), not a hidden field. Consistency
      beats subtly-different empty states.
- [ ] Clicking the card navigates to `/articles/[slug]` as
      before. The clap glyph is *display-only* on the card — the
      viewer clap only happens on the read page.

### API contract

- [ ] `POST /api/articles/{slug}/claps` — signed-in, article
      exists and is published, viewer has never clapped → 201
      `{ viewerCount: 1, totalCount: <n+1> }`. A row is created
      in `Clap` with `count = 1`.
- [ ] `POST /api/articles/{slug}/claps` — signed-in, existing
      row → 200 `{ viewerCount: <prev+1>, totalCount: <n+1> }`.
      The `Clap.count` for `(viewerId, articleId)` is
      incremented by 1; `updatedAt` bumps.
- [ ] `POST /api/articles/{slug}/claps` with body
      `{ delta: <k> }` where `1 ≤ k ≤ 50` — signed-in, existing
      row → 200 with `viewerCount = min(prev + k, 50)` and
      `totalCount` incremented by however many claps were
      actually added (may be less than `k` if the cap
      intervened). Cap enforcement is server-side; the client
      cannot exceed 50 by sending `delta: 999`.
- [ ] `POST /api/articles/{slug}/claps` — signed-in, viewer is
      the article's author → 400
      `{ error: { field: "slug", code: "self-clap" } }`. No row
      is created / updated. Matches the `self-follow` shape.
      **Applies to authored drafts too**: an author POSTing to
      their own unpublished article still gets `400 self-clap`,
      not `404`. The 404 branch below is scoped to drafts *not
      owned by the caller* — an author knows their own draft
      exists, so no information leaks, and self-clap is the
      more specific violation.
- [ ] `POST /api/articles/{slug}/claps` — signed-in, article
      slug unknown OR article is a draft not owned by the
      caller → 404 `{ error: "not-found" }`. (Drafts do not
      leak: same "404, never 403" rule from articles-crud
      slice 4a.) Precedence rule for the route: resolve the
      article via `resolveArticleForCaller` first (which returns
      404 for both unknown-slug and someone-else's-draft), then
      check `article.authorId === session.user.id` for the
      self-clap 400. That order is what makes "author on own
      draft → 400" deterministic rather than dependent on which
      check the route wrote first.
- [ ] `POST /api/articles/{slug}/claps` — anonymous → 401
      `{ error: "unauthenticated" }`. No row is created.
- [ ] `POST /api/articles/{slug}/claps` — body `{ delta: 0 }`
      or `{ delta: -3 }` or `{ delta: 51 }` → 400
      `{ error: { field: "delta", code: "out-of-range" } }`.
      Rejected at the schema, not silently clamped, so a
      confused client sees the error instead of a mystery
      no-op.
- [ ] `DELETE /api/articles/{slug}/claps` — signed-in, existing
      row → 204 (empty body). The row is deleted. Idempotent:
      DELETE again → still 204.
- [ ] `DELETE /api/articles/{slug}/claps` — signed-in, no row
      exists → 204. Symmetric to `DELETE /follow` — nothing to
      remove is not an error.
- [ ] `DELETE /api/articles/{slug}/claps` — signed-in, article
      slug unknown / hidden draft → 404 `{ error: "not-found" }`.
- [ ] `DELETE /api/articles/{slug}/claps` — anonymous → 401.
- [ ] `GET /api/articles/{slug}` — response `article` object
      now includes `clapCount: number` (aggregate, all readers)
      and, when a session is present, a `viewer: { clapCount,
      hasClapped }` sibling block. For anonymous callers the
      `viewer` block is omitted (not `null`) so a downstream
      typescript client can discriminate on presence rather
      than value.
- [ ] `GET /api/articles` and `GET /api/feed` and
      `GET /api/users/{username}/articles` — every
      `PublicArticleSummary` in the response now carries
      `clapCount: number`. No `viewer` block on the summary
      shape — feed cards render the aggregate only. (Rationale:
      per-card `viewer.hasClapped` would be a materialisation
      cost paid on every card render with zero read paths in
      v1. If a feed-side "you've clapped this" affordance ever
      lands, that's when it earns its slot on the shape.)

### OpenAPI coverage

- [ ] Both new endpoints (`POST /api/articles/{slug}/claps`,
      `DELETE /api/articles/{slug}/claps`) appear in
      `/api/openapi.json` — enforced by the coverage guard from
      slice 4a / #5.
- [ ] The updated `ArticleView` and `PublicArticleSummary`
      schemas in `/api/openapi.json` reflect the new
      `clapCount` field (and the conditional `viewer` block on
      `ArticleView`).

## Non-goals

- **Per-clap timestamps.** No `ClapEvent` audit table. The
  aggregate `Clap.count` is enough for a display counter; if
  we ever want a "50 recent claps" heatmap, that's an additive
  migration on a Phase-2 spec.
- **Undoing individual claps.** DELETE clears the viewer's
  entire clap contribution for the article; there's no
  `-1`-per-click. Matches Medium's real UX and dodges the
  "which of my N claps am I removing" question.
- **Clap counts on the profile header** ("your articles have
  received 1,204 claps total"). Aggregation surface, own slice
  if it earns one.
- **Clap-based sort / trending feed.** Global and Your Feed
  remain `publishedAt DESC, id DESC`. Sorting by clap-count
  needs a separate index and a stable-tiebreak conversation
  worth its own spec.
- **Anonymous clap that "sticks" until login** (deferred write).
  Anonymous click → redirect to `/login`, and the callbackUrl
  brings them back to the article, but no clap is written pre-
  or post-login. Same trade-off Follow made.
- **Clap widgets on the reader profile.** No "I clapped for these
  articles" surface for the reader. That's a bookmarks-adjacent
  Phase 2 story.
- **Realtime clap-count updates.** No revalidation-on-someone-
  else's-clap. The count is a snapshot per render.
- **Rate limiting on `POST /claps`.** Phase-2 hold. The 50-clap
  cap plus the "one row per (user, article) pair" schema mean
  the worst a malicious client can do is `UPDATE ... SET count
  = 50` on rows they already own.

## Data model delta

New `Clap` model — one row per `(userId, articleId)` pair.

```prisma
model Clap {
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  articleId String
  article   Article  @relation(fields: [articleId], references: [id], onDelete: Cascade)
  count     Int      @default(1)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@id([userId, articleId])
  @@index([articleId])
}
```

Add on `User`:

```prisma
claps Clap[]
```

Add on `Article`:

```prisma
claps Clap[]
```

Migration: `pnpm db:migrate --name claps-add-clap-model`.

### Why an aggregate `count` column instead of one row per clap

- One row per (user, article) pair means `SUM(count) GROUP BY articleId`
  scans at worst `#readers` rows per article — orders of magnitude
  cheaper than `COUNT(*)` over an event table where a popular article
  with 10k viewers averaging 20 claps each is 200k rows.
- Incrementing existing claps is a single `UPDATE ... SET count = count + ?`
  — no per-clap insert amplification on a rapid tap.
- The two natural queries — "how many claps for this article?"
  (`SUM(count)` for one `articleId`) and "how many for these
  articles?" (`groupBy articleId` — used by the feed) — both
  fall out of the `@@index([articleId])` index.
- Per-clap timestamps are the only thing we'd get from an event
  table, and they're explicitly a non-goal.

### Why the composite primary key on `(userId, articleId)`

- Natural idempotency for `POST /claps`: the fast path is a
  probe on the composite key, and the "already clapped" case is
  a single `UPDATE ... WHERE userId = ? AND articleId = ?
  RETURNING count`. No `findFirst` scan.
- Deletes cascade in both directions — a deleted user's claps
  vanish; a deleted article's claps vanish — matching the
  existing user/article cascade shape.
- Follows the same design decision the `Follow` model made in
  slice 6 (see docs/specs/follow.md § Why an explicit `Follow`
  model): "composite `@@id` → natural upsert, no findFirst
  round-trip."

### Cap enforcement

The 50-cap is enforced **server-side** inside the shared
`lib/claps/service.ts` helper, not at the schema layer (a check
constraint would fire *after* the `UPDATE` and surface as an
opaque DB error). Zod validates the request `delta ∈ [1, 50]`;
the cap intersection happens in the service. Rationale: the
service already owns the count arithmetic (increment logic,
rollback on race), so putting the cap there keeps a single source
of truth.

**Race-safe write path.** The read-modify-write for an existing
row runs inside `db.$transaction`, and the initial `SELECT` uses
`FOR UPDATE` to lock the `(userId, articleId)` row for the
transaction's duration. That is what makes the cap arithmetic
atomic — two overlapping `POST /claps` from the same viewer
serialise on the lock rather than each reading a stale `count`
and racing to overwrite the other's increment. The applied
delta is `Math.min(currentCount + requestedDelta, 50) - currentCount`,
so a request that would exceed the cap is clamped and reports
the actually-applied delta in the response (never over 50).

**Race-safe first-clap path.** For a viewer who has no row yet,
the service probes on the composite key, then attempts a
`db.clap.create` outside the transaction. If two concurrent
first-clap requests race, one wins and the other catches
Prisma's `P2002` (unique-constraint violation on the composite
PK) and falls through to the increment path — which then runs
under the row lock described above. Net effect: no duplicate
row, no lost update, and the second request returns `200` (a
subsequent bump) rather than `201`. Same P2002-catch pattern
`lib/follows/service.ts` uses in slice 6.

## API surface

| Method | Path                                | Auth | Input (Zod)          | Output                                                                                                            |
| ------ | ----------------------------------- | ---- | -------------------- | ----------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/articles/{slug}/claps`        | Yes  | `AddClapsInput`      | `201 { viewerCount, totalCount }` (first clap); `200` on repeat; `400`; `401`; `404`                              |
| DELETE | `/api/articles/{slug}/claps`        | Yes  | *(none)*             | `204`; `401`; `404`                                                                                               |

Zod schemas live under `lib/validation/claps.ts`:

- `AddClapsInput = { delta?: number }` where `delta` (when
  present) is an integer in `[1, 50]`. Missing body / empty body
  parses as `{ delta: 1 }` — the natural per-click semantics.
  A `delta` of `0`, negative, non-integer, or `> 50` → 400
  `{ error: { field: "delta", code: "out-of-range" } }`.

Response shape:

- `viewerCount: number` — the caller's `Clap.count` after the
  write (`0 ≤ viewerCount ≤ 50`).
- `totalCount: number` — `SUM(count)` for the article across all
  readers, after the write.

### Error shape

All 400 / 401 / 404 reuse the shapes already in use across the
API:

- 401 → `{ error: "unauthenticated" }` (literal string, matches
  `/api/users/{username}/follow`).
- 404 → `{ error: "not-found" }` (literal string, same).
- 400 → `{ error: { field, code, message? } }` (field-scoped,
  from slice 4a). New codes:
  - `slug` field: `self-clap` (author attempting to clap for
    their own article).
  - `delta` field: `out-of-range` (see `AddClapsInput` above).

### Additive shape changes

- `PublicArticleSummary` (in `lib/articles/service.ts`) gains
  `clapCount: number`. Every listing that produces this shape
  (`GET /api/articles`, `GET /api/feed`,
  `GET /api/users/{username}/articles`, and the RSC-side
  `/profiles/[username]` render) receives it via the same
  aggregate join described below in § Read path.
- `ArticleView` (in `lib/articles/view.ts`) gains
  `clapCount: number` unconditionally and
  `viewer?: { clapCount: number; hasClapped: boolean }` for
  authenticated `GET /api/articles/{slug}` callers only. The
  `viewer` block is *omitted* for anonymous callers, not set to
  `null` — clients discriminate on presence, matching how the
  session itself is present/absent rather than "session: null".

## Read path — how counts get on the responses

Two aggregate reads, both centralised in
`lib/claps/service.ts`:

- `sumClapsForArticles(articleIds: string[]): Map<string, number>`
  — one `groupBy articleId, _sum: { count }` call that shapes
  its result into a `Map` keyed by article id. Called from
  every listing (`listPublishedArticlesByUsername`,
  `listPublishedFeed`) so the summary rows are enriched in a
  single round-trip. An empty input returns an empty Map (no
  DB call).
- `getViewerClapState(viewerId: string, articleId: string):
  { clapCount: number; hasClapped: boolean }` — a single
  `findUnique` on `(userId, articleId)`. Called only from
  `GET /api/articles/{slug}` when a session exists. Never
  called per-card — that's the "no `viewer` on
  `PublicArticleSummary`" decision above.

For the single-article `GET /api/articles/{slug}` path, the
route reads the article, then in parallel with the viewer-state
lookup runs a single-row aggregate for the total. No N+1 on
either path.

## UI surface

- `/articles/[slug]` — server component (existing). Learns to
  read the viewer's session, feed the article id +
  `viewer.clapCount` into a new `<ClapButton>` when the viewer
  is authenticated and is not the author. When anonymous or
  when the viewer is the author: renders the total as static
  text (no button for author; button-that-redirects for
  anonymous — see `<ClapButton>` below).
- `<ArticleCard>` (existing, `components/articles/`) — gains
  a `clapCount` prop and renders it inline on the byline row.
  Client-agnostic — the card stays a pure display component.
- No new routes land in this slice.

Shared components (`components/claps/`):

- `<ClapButton>` — client component, one of two discriminated
  variants selected at the render site by the parent server
  component (never a runtime branch inside the client bundle,
  so the anonymous DOM does not ship the optimistic-click JS):

  - **Signed-in variant** — `<ClapButton variant="signed-in"
    slug={string} initialViewerCount={number}
    initialTotalCount={number} />`. Uses React's `useOptimistic`
    to render `viewerCount + pending` immediately on click, then
    reconciles with the server response. Batches rapid clicks
    behind a single in-flight POST (subsequent clicks queue as a
    larger `delta` on the next request rather than firing one
    POST per click — reduces server pressure without slowing the
    UI). On a server error: reverts the optimistic delta and
    surfaces a `role="alert"` message inline.
  - **Anonymous variant** — `<ClapButton variant="anonymous"
    slug={string} initialTotalCount={number}
    articlePath={string} />`. Renders a `<Link href="/login?
    callbackUrl=<articlePath>">` — an `<a>`, not a `<button>`,
    with the same accessible-name prefix so screen readers hear
    the same affordance. `articlePath` is a plain string built
    by the server component (`/articles/${slug}`); no server-
    side callback prop crosses the RSC/client boundary (RSC
    props must be serializable, functions are not). Same
    server-rendered-link pattern `<FollowButton>` uses in slice
    6 for its anonymous branch.

  Author-viewing-own-article: the parent server component renders
  no `<ClapButton>` at all (only `<ClapCount>`). A disabled clap
  button on your own article would read as an active affordance
  you're being denied, not as "not applicable" — and keeping the
  author branch out of the client bundle entirely means an author
  can never re-enter it via a DOM-hack retry.

- `<ClapCount count={number} />` — pure display, shared between
  `<ClapButton>` and `<ArticleCard>` so a change to the "0 → dim
  it? show a heart?" convention flips in one place.

Every affordance is `getByRole` / `getByLabel`-reachable. No
`data-testid`. The button's accessible name reads
`"Clap for this article (0 / 50)"` at rest and updates as the
count changes so a screen-reader user hears the state.

## Testing seams

None. The `Clap` rows are seeded through the same authenticated
`APIRequestContext` the follow/article factories already use,
with a `clapFactory.create(readerApi, slug, delta?)` helper
that POSTs to `/api/articles/{slug}/claps`. No env-gated back
door needed.

For the "server error reverts optimistic count" test, use
Playwright's `page.route()` to fail the POST — no app-side
seam required.

## Seed impact

Extend `prisma/seeds/baseline.ts` so **Bob claps 5 times for
Alice's "Welcome to Medium-Alt"** on a fresh `pnpm db:seed`.
That single row is enough that:

- Alice's article read view shows a non-zero total-clap count.
- Bob's read view of the same article shows `Clapped (5)` with
  the button in the "already clapped" state, so the "reload
  preserves state" story is demoable without a manual click
  round.
- The Global feed card for that article shows a non-zero
  clap-count glyph, so the "counts on cards" story is
  demoable without publishing new articles.

Same idempotency contract as the rest of the seed: `findUnique`
+ `create` on the composite `@@id([userId, articleId])`. The
seed writes `count: 5` directly rather than looping 5 POSTs —
seeds set state, they don't drive UI. On second run the
existing row is left untouched (empty update); the counter in
the `BaselineSummary` reports it as `skipped`.

The CI drift check (`pnpm db:seed` step from
[`docs/specs/dev-seed.md`](dev-seed.md) § CI wiring)
automatically catches any schema-clap mismatch introduced by
this slice.

## E2E test plan

- `e2e/tests/claps/clap-button.spec.ts` — happy path: signed-in
  reader on another user's article, single-click bump,
  reload-preserves-state, author-doesn't-see-button,
  anonymous-click-redirects. `@smoke @regression`
- `e2e/tests/claps/rapid-tap.spec.ts` — 10 rapid clicks land as
  `Clapped (10)`; 51st click at the 50-cap is a no-op;
  network-error revert surfaces the inline alert.
  `@regression`
- `e2e/tests/claps/counts-on-cards.spec.ts` — clap count
  renders on `<ArticleCard>` across Global, Your Feed, tag
  filter, and profile listings. Reads the seed's non-zero
  article for a real number rather than always `0`.
  `@regression`
- `e2e/api/claps/claps.spec.ts` — POST happy path (first clap
  201, repeat 200, `delta` batch), self-clap 400, unknown /
  draft 404, anonymous 401, `delta` out-of-range 400, DELETE
  happy + idempotent + 404 + 401. `@smoke @api @regression`
- `e2e/api/claps/article-view.spec.ts` — `GET /api/articles/{slug}`
  contains `clapCount`; the `viewer` block is present for a
  signed-in caller with clap state and absent for an anonymous
  caller. `@smoke @api`
- `e2e/api/claps/summary-shape.spec.ts` — `GET /api/articles`,
  `GET /api/feed`, and `GET /api/users/{username}/articles`
  all include `clapCount` on every summary row, and no
  `viewer` block appears on any summary. `@regression @api`

Fixture wired as part of this slice:

- `clapFactory` under `e2e/support/factories/clap.factory.ts`
  — `.create(readerApi, slug, opts?)` POSTs to
  `/api/articles/{slug}/claps` with an optional `{ delta }`
  body. `.delete(readerApi, slug)` for the symmetric clear.
  No `.build()` — a clap with no article is meaningless.

## Open questions

None — the three genuine forks (multi-clap vs. binary favorite;
count on cards vs. read-page only; anonymous-click behavior)
were confirmed before drafting. Cosmetic values (glyph
character, exact cap-reached label copy) are implementation
defaults and stay editable during code review.
