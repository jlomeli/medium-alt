# Spec: Follow + your-feed (slice 6 of 8)

Tracking: #18
Status: draft
Owner: jlomeli

## Position in the roadmap

Step 6 of the roadmap in
[`docs/architecture.md`](../architecture.md) ("Follow + your-feed").
Ships as a single PR — the surface is one relation, two endpoints,
one tab, and one button. Further slicing would cost more than it
delivers.

Explicitly deferred to their own slices or Phase 2:

- **Followers / following lists on the profile.** `/profiles/[username]`
  gains the Follow button but not `/followers` or `/following`
  routes. See § Non-goals.
- **Follow counts on the profile.** Same reason.
- **Slice 7 — Claps.** Nothing in this slice touches article
  engagement metadata.
- **Follow a tag.** Only user-follows-user in v1. Tag-follow would
  be its own model.

## Intent

Ship the first personalisation surface. Today every reader sees the
same global feed; the app has no notion of "authors I want to hear
from again." This slice introduces a directed `User → User` follow
relation, a Follow / Unfollow control on the profile page, and a
"Your Feed" tab on the home page that filters the existing global
feed down to authors the signed-in reader follows.

It also lands the durable piece the Claps + Comments slices will
lean on for their own "current viewer state" affordances: the
per-request "is the viewer following this author?" read, wired into
the same shared article-service module so a future
`viewer.hasClapped` / `viewer.hasCommented` on `PublicArticleSummary`
follows the same shape.

## User stories

- As a signed-in reader, I want to follow an author from their
  profile page so their new articles surface in a feed I can
  return to.
- As a signed-in reader, I want to unfollow an author from the
  same button so I can stop seeing their articles in Your Feed
  without leaving the profile.
- As a signed-in reader, I want a "Your Feed" tab on the home
  page that shows the latest published articles from authors I
  follow, newest first, paginated the same way the global feed is.
- As a signed-in reader who follows no one yet, I want the Your
  Feed tab to explain why it's empty and point me at the Global
  feed and Popular tags so I have something to do.
- As an anonymous visitor, I want the home page to look the same
  as before (Global feed + tag filter), with no Your Feed tab
  offered — the tab is meaningless without an account.
- As an author, I want visiting my own profile to *not* show a
  Follow button — following yourself is not a real concept.
- As a signed-in reader on someone else's profile, I want the
  Follow / Unfollow button state to survive a page reload — it
  reflects real DB state, not just this session's clicks.

## Acceptance criteria

Each becomes one Playwright test. Grouped by journey.

### Follow button on the profile (`/profiles/[username]`)

- [ ] Signed-in visitor on another user's profile sees a "Follow"
      button. Clicking it flips the button to "Unfollow" without a
      full page reload feeling broken (a server-action navigation
      is fine — the label reflects DB state after the round-trip).
- [ ] Clicking "Unfollow" flips the button back to "Follow" and,
      combined with the previous step, is fully idempotent — the
      DB row exists after one Follow click and after N Follow
      clicks; it's absent after one Unfollow click and after N.
- [ ] Reloading the profile after following surfaces the button in
      the "Unfollow" state; reloading after unfollowing surfaces
      it as "Follow". The label is derived from the DB, not from
      client state.
- [ ] Signed-in visitor on their **own** profile never sees a
      Follow / Unfollow button — the affordance is absent from the
      DOM, not just disabled.
- [ ] Anonymous visitor on any profile sees a "Follow" button that,
      when clicked, routes them to `/login?callbackUrl=/profiles/<username>`.
      No follow row is created. (Rationale: hiding the button
      entirely leaves anonymous users guessing how to follow;
      showing it and redirecting on click is the RealWorld pattern
      and gives us a real acceptance test for the auth gate.)

### Your Feed tab on home (`/?feed=me`)

- [ ] Signed-in visitor sees two tabs above the feed: "Your Feed"
      and "Global". The active tab reflects `?feed=me` vs. the
      absence of the query param.
- [ ] Anonymous visitor sees no "Your Feed" tab. `/` still renders
      the global feed with the popular-tags sidebar exactly as it
      did before this slice.
- [ ] An anonymous visitor who navigates directly to `/?feed=me`
      is redirected to `/login?callbackUrl=/%3Ffeed%3Dme` (or
      equivalent) — Your Feed requires a session.
- [ ] Signed-in visitor on `/?feed=me` sees a paginated list of
      published articles from authors they follow, newest-first by
      `publishedAt`, with the same `<ArticleCard>` rendering as
      the global feed (title, subtitle, author byline,
      `publishedAt`, tag chips).
- [ ] A signed-in visitor who follows nobody lands on an empty
      state that says "You aren't following anyone yet." and
      renders two `getByRole('link')`s: one to Global (`/`) and
      one anchored to the Popular tags sidebar. No feed cards, no
      "Next" button.
- [ ] The Your Feed tab uses the same cursor pagination shape as
      Global — a "Next" affordance appears iff another page exists;
      clicking it surfaces stable, non-overlapping pages.
- [ ] The `?tag=<slug>` filter is meaningful only on the Global
      tab. Landing on `/?feed=me&tag=writing` ignores the `?tag=`
      param (Your Feed is scoped by author, not by tag) and still
      renders Your Feed. (Rationale: combining follow-filter and
      tag-filter is a real feature but not in v1 scope — see
      § Non-goals — and silently ignoring the param beats a 400
      on a URL a user typed.)

### API contract

- [ ] `POST /api/users/{username}/follow` — signed-in, target
      exists, no existing follow row → 201
      `{ following: true, followedAt: <ISO> }`. A row is
      created in `Follow`.
- [ ] `POST /api/users/{username}/follow` — signed-in, target
      exists, follow row **already exists** → 200
      `{ following: true, followedAt: <ISO> }`. No duplicate row;
      the response is byte-identical to the "just created" case
      except for the status code (idempotent write).
- [ ] `POST /api/users/{username}/follow` — signed-in, target is
      the caller themselves → 400
      `{ error: { field: "username", code: "self-follow" } }`.
      No row is created.
- [ ] `POST /api/users/{username}/follow` — signed-in, target
      username unknown → 404
      `{ error: { field: "username", code: "not-found" } }`.
- [ ] `POST /api/users/{username}/follow` — anonymous → 401
      `{ error: { code: "unauthenticated" } }`. No row is created.
- [ ] `DELETE /api/users/{username}/follow` — signed-in, follow
      row exists → 204 (empty body). Row is gone.
- [ ] `DELETE /api/users/{username}/follow` — signed-in, no follow
      row exists → 204 (empty body). Idempotent — deleting a
      non-existent relationship is not an error, matches the
      symmetric POST-when-exists behaviour.
- [ ] `DELETE /api/users/{username}/follow` — signed-in, target
      username unknown → 404. (An unknown target is a *client
      error*, not idempotency territory.)
- [ ] `DELETE /api/users/{username}/follow` — anonymous → 401.
- [ ] `GET /api/feed` — signed-in → 200
      `{ items: PublicArticleSummary[], nextCursor: string | null }`.
      Same shape as `GET /api/articles`. Only published articles
      by followed authors; newest first; `items.length ≤ limit`.
- [ ] `GET /api/feed` — signed-in, viewer follows nobody → 200
      `{ items: [], nextCursor: null }` (empty, not 404 — same
      reasoning as `?tag=<unknown>` on the global feed).
- [ ] `GET /api/feed` — anonymous → 401
      `{ error: { code: "unauthenticated" } }`.
- [ ] `GET /api/feed?cursor=<opaque>` and `GET /api/feed?limit=<n>`
      — same validation rules and error codes as `GET /api/articles`
      (`cursor` field `invalid` → 400; `limit` field `out-of-range`
      → 400). Cursor semantics reuse
      `(publishedAt DESC, id DESC)` so a page from Your Feed and a
      page from Global are comparable and can share the decoder.
- [ ] `GET /api/feed` never contains an article authored by the
      viewer themselves, even if the viewer somehow ends up as a
      follower of themselves (belt-and-braces against a
      hypothetical direct-DB seed). The route filters
      `authorId != viewerId` in addition to the follow join.

### OpenAPI coverage

- [ ] All three new endpoints (`POST /api/users/{username}/follow`,
      `DELETE /api/users/{username}/follow`, `GET /api/feed`)
      appear in `/api/openapi.json` — enforced by the coverage
      guard from #5.

## Non-goals

- **Followers / following lists.** No `/profiles/[username]/followers`
  or `/following` routes. A signed-in reader can rediscover who they
  follow by browsing to a profile and seeing the Unfollow state; the
  reverse ("who follows me") is Phase 2.
- **Follow counts.** No "127 followers" number anywhere in the UI or
  API in v1. Aggregation on a live count column is a write-path cost
  worth deferring until there's a real UX asking for it.
- **Follow-a-tag.** Only user-follows-user. A `TagFollow` model would
  be a superset of the tag-filter feature from slice 5 and belongs
  to its own slice if we ever want it.
- **Combined follow + tag filter.** `?feed=me&tag=<slug>` intentionally
  ignores `?tag=`. Supporting both dimensions is a UX question
  (does the tag chip on Your Feed jump you to Global?), not just a
  query.
- **Notifications when someone follows you.** No notifications
  surface exists in v1 at all (see `docs/architecture.md` § Scope).
- **Mute / block.** The inverse of follow is unfollow, not mute.
  Adversarial UX is out of scope.
- **Suggested-authors / who-to-follow surface.** The empty-state CTAs
  point at Global and Popular tags — discovery, not recommendation.
- **Rate limiting on follow / unfollow.** Same Phase-2 hold as the
  rest of the write surface.
- **Real-time feed updates.** No websockets, no revalidation on new
  publishes from a followed author. Reload the page.

## Data model delta

New `Follow` model — explicit join with composite primary key.

```prisma
model Follow {
  followerId  String
  follower    User     @relation("FollowFollower", fields: [followerId], references: [id], onDelete: Cascade)
  followingId String
  following   User     @relation("FollowFollowing", fields: [followingId], references: [id], onDelete: Cascade)
  createdAt   DateTime @default(now())

  @@id([followerId, followingId])
  @@index([followerId])
  @@index([followingId])
}
```

Add on `User`:

```prisma
following Follow[] @relation("FollowFollower")   // rows where this user is doing the following
followers Follow[] @relation("FollowFollowing")  // rows where this user is being followed
```

### Why an explicit `Follow` model over an implicit self-M2N

- Composite `@@id([followerId, followingId])` gives natural
  idempotency: `POST /follow` becomes an upsert on the composite
  key with no `findFirst` round-trip.
- `createdAt` lands for free — useful the day we want a
  "recently followed" surface without another migration.
- Prisma implicit self-relations require disambiguating relation
  names anyway, so the implicit form isn't actually simpler.
- The two indexes match the two read patterns: "who does X
  follow?" (`followerId`) → Your Feed; "who follows X?"
  (`followingId`) → future follower list.

Migration: `pnpm db:migrate --name follow-add-follow-model`.

## API surface

| Method | Path                                | Auth  | Input (Zod) | Output                                                                     |
| ------ | ----------------------------------- | ----- | ----------- | -------------------------------------------------------------------------- |
| POST   | `/api/users/{username}/follow`      | Yes   | *(none)*    | `201 { following: true, followedAt }` / `200` on idempotent repeat; `400`; `401`; `404` |
| DELETE | `/api/users/{username}/follow`      | Yes   | *(none)*    | `204`; `401`; `404`                                                        |
| GET    | `/api/feed`                         | Yes   | `?cursor=&limit=` | `200 { items: PublicArticleSummary[], nextCursor: string \| null }`; `400`; `401` |

Zod schemas: reuse existing `feedQuerySchema` (drop the `tag` field
on the your-feed variant — see `feedYourQuerySchema` under
`lib/validation/feed.ts`) and error envelope from slice 4a. No new
request bodies (follow / unfollow are parameter-only).

`PublicArticleSummary` is unchanged. The current-viewer's
follow-status is intentionally *not* added to the shape — the only
surface that needs "is the viewer following this author?" is the
profile page, which reads it once per render, not on every card in
a feed. Adding a per-card `viewer` field would be write-amplification
for zero read paths in v1.

### Error shape

All 400 / 401 / 404 use the existing `{ error: { field, code, message? } }`
shape from slice 4a. New codes:

- `username` field on POST `/follow`: `self-follow` (attempting to
  follow oneself), `not-found` (unknown target).
- top-level on both routes: `unauthenticated` (no session).

## UI surface

- `/` — server component (existing). Learns to read the
  `?feed=me` query param. When set **and** the viewer is
  signed-in, renders `<YourFeedList>` (server-driven, same
  cursor shape as `<FeedList>`); otherwise renders the existing
  global feed. Tabs render above the feed section.
- `/profiles/[username]` — server component (existing). Learns
  to read the viewer's session and, when the viewer is
  authenticated and viewing someone else's profile, reads the
  follow-status once via
  `lib/follows/service.ts::isFollowing(viewerId, targetId)` and
  passes it into a new `<FollowButton>`.
- No new routes land in this slice.

Shared components:

- `<FollowButton username={string} initialFollowing={boolean} />`
  — client component (Follow / Unfollow toggle). Uses a
  React `useTransition` around a server action so the browser
  navigation feels instantaneous but the "Unfollow" label is a
  real re-derivation from the server response, not optimistic UI.
  (Optimistic UI is a Claps concern in slice 7 — deliberate
  choice to keep this slice's client-state surface minimal.)
- `<FeedTabs active="global" | "you" />` — renders the two
  `<Link>` tabs above the feed section on `/`. Only rendered
  when the viewer is authenticated.
- `<YourFeedEmpty />` — the empty-state block: heading, two
  `getByRole('link')` CTAs pointing at Global and at the Popular
  tags sidebar (page-anchor link `#popular-tags`).

Every affordance is `getByRole` / `getByLabel`-reachable. No
`data-testid`.

## Testing seams

None. The follow relation is seeded through the same authenticated
`APIRequestContext` the article factory already uses. A
`followFactory.create(followerApi, targetUsername)` helper wraps
the `POST /api/users/{username}/follow` call so tests don't repeat
the URL construction; no env-gated back door is needed.

## Seed impact

Extend `prisma/seeds/baseline.ts` so **Bob follows Alice** on a
fresh `pnpm db:seed`. That single edge is enough that:

- Logging in as Bob and visiting `/?feed=me` shows Alice's three
  published articles (non-empty Your Feed on first look).
- Logging in as Alice and visiting `/?feed=me` shows the empty
  state (Alice follows nobody in the baseline).
- Both directions of the acceptance criteria are demoable without
  any test-only setup.

Same idempotency contract as the rest of the seed: `upsert` on the
composite `@@id([followerId, followingId])`, empty `update` clause.

The CI drift check (`pnpm db:seed` step from
[`docs/specs/dev-seed.md`](dev-seed.md) § CI wiring) automatically
catches any schema-follow mismatch introduced by this slice.

## E2E test plan

- `e2e/tests/follow/profile-button.spec.ts` — Follow ↔ Unfollow
  toggle from `/profiles/[username]`, own-profile hides the
  button, anonymous click redirects to `/login`, state survives
  reload. `@smoke @regression`
- `e2e/tests/follow/your-feed.spec.ts` — tab visibility (signed-in
  vs. anonymous), Your Feed vs. Global correctness (only followed
  authors surface), empty state renders CTAs, direct `/?feed=me`
  as anonymous redirects to login. `@smoke`
- `e2e/tests/follow/your-feed-pagination.spec.ts` — cursor pages
  on Your Feed are stable and non-overlapping, "Next" disappears
  at end, `?feed=me&tag=<slug>` ignores the tag param.
  `@regression`
- `e2e/api/follow/follow.spec.ts` — POST / DELETE happy paths,
  idempotency (repeat POST → 200; repeat DELETE → 204),
  self-follow 400, unknown target 404, anonymous 401.
  `@smoke @api @regression`
- `e2e/api/follow/feed.spec.ts` — GET happy path, empty-when-no-follows,
  cursor / limit round-trip + validation, anonymous 401, viewer's
  own articles excluded. `@smoke @api @regression`

Fixture wired as part of this slice:

- `followFactory` under `e2e/support/factories/follow.factory.ts`
  — `.create(followerApi, targetUsername)` POSTs to
  `/api/users/{username}/follow` using the caller's already-authed
  `APIRequestContext`. No `.build()` variant — a follow with no
  target is meaningless.

## Open questions

None — recommendations were confirmed before drafting. Concrete
values (empty-state copy, tab label wording) are implementation
defaults and stay editable during code.
