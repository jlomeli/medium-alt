# Spec: Signed-in navigation

Tracking: #27
Status: draft
Owner: jlomeli

## Position in the roadmap

Post-v1 follow-on. The eight roadmap slices in
[`docs/architecture.md`](../architecture.md) delivered every read/write
path a signed-in user needs, but the site header (`components/auth/Header.tsx`)
still only ships `Log out` for authenticated users. This spec closes the
"you have to know the URL" gap: the app becomes browsable for signed-in
users without touching any of the shipped feature slices.

Deliberately scoped tight:

- **In:** header primary-CTA ("Write"), AccountMenu items linking to
  `/me`, `/me/articles`, `/me/edit`, `/articles/new`.
- **Out:** anything that would require a new endpoint or a new page.
  Every destination in this spec is a route that already ships.

## Intent

Today a signed-in user landing on `/` sees a header with their name /
email in an `Account` button whose only menu item is `Log out`. To
reach their own articles list, edit their profile, or start a new
draft, they have to type the URL by hand. That's fine for the E2E
harness (which navigates by URL) but the app is unusable as a product.

This slice threads the shipped pages into the header:

1. A primary "Write" affordance in the header — the classic
   Medium-style CTA that anchors the whole product for logged-in users.
2. Dashboard links inside the `AccountMenu` for the three `/me/*`
   pages, keeping the "Log out" item at the bottom.

No new logic — every link points at a page the router already serves.

## User stories

- As a signed-in reader on any page, I want a visible "Write" button
  in the header so I can start a new draft in one click.
- As a signed-in user, I want to open the account menu and jump to
  my profile, my articles list, or my settings without knowing any
  URLs.
- As a signed-in user, I want "Log out" to stay the last item in the
  account menu so muscle memory from the current build doesn't shift.
- As an anonymous visitor, I want the header to look exactly as it
  does today (Log in / Sign up) — the Write CTA has no meaning
  without a session and shouldn't tease me into a login redirect.

## Acceptance criteria

Each becomes one Playwright test. Grouped by journey.

### Header (`components/auth/Header.tsx`)

- [ ] Signed-in visitor on any page (`/`, `/articles/[slug]`,
  `/profiles/[username]`, `/me`, …) sees a `getByRole('link', { name: 'Write' })`
  in the header that navigates to `/articles/new`.
- [ ] Anonymous visitor on any page does NOT see the "Write" link.
  The `Log in` and `Sign up` links still render exactly as today.
- [ ] The Write link is a real `<Link>` (SSR-visible in the initial
  HTML), not a client-only render — so an anonymous visitor never
  briefly sees it flash before hydration decides they aren't
  logged in.

### AccountMenu (`components/auth/AccountMenu.tsx`)

- [ ] Signed-in visitor opens the account menu and sees, in order:
  `Your profile` → `/me`, `Your articles` → `/me/articles`,
  `Settings` → `/me/edit`, then `Log out` (the existing form-submit
  item, unchanged).
- [ ] All three new items are `role="menuitem"`s (matches the
  existing `Log out` item's role so `getByRole('menuitem', { name })`
  is uniform).
- [ ] The three navigation items are `<Link>`s (client-side
  navigation) — not form submits. Only `Log out` remains a form
  submit because it clears the JWT cookie server-side.
- [ ] Keyboard: opening the menu, pressing `Tab`, cycling through
  items, and pressing `Enter` on `Your profile` lands on `/me`.
  (One representative keyboard test — the click test above covers
  the rest.)
- [ ] Clicking outside the menu still closes it (existing behaviour
  regression-guarded).
- [ ] Anonymous visitor sees no `AccountMenu` at all — header
  fallback (`Log in` / `Sign up`) is unchanged.

### Cross-cutting

- [ ] Every affordance is `getByRole` / `getByLabel`-reachable —
  no `data-testid` needed.
- [ ] Header renders unchanged HTML for anonymous visitors: a
  snapshot / attribute-count assertion catches accidental
  divergence in the fallback branch.

## Non-goals

- **Bottom-nav / mobile drawer.** Header is desktop-first; mobile
  responsiveness of the menu is a separate visual polish slice.
- **User avatar / gravatar in the account menu.** `User.image` is
  still not populated (see `profile.md` § Non-goals — Avatar upload).
  The button keeps its current text label.
- **Notifications bell.** No notifications surface exists in v1
  (see `docs/architecture.md` § Scope).
- **Search box in the header.** Tag filter on `/` covers discovery
  in v1 (`tags-feed.md` § Non-goals — full-text search).
- **Global "Home" / "Explore" links.** The `Medium-Alt` wordmark
  already links to `/`; a second Home link would be redundant.
- **Renaming `Log out` to `Sign out`.** Existing tests query
  `getByRole('menuitem', { name: 'Log out' })`; renaming it is a
  test-migration cost with no user value.
- **Highlighting the active section** (bold "Your articles" when on
  `/me/articles`, etc.). Deferrable; not a correctness concern.

## Data model delta

None. No endpoint changes, no schema changes, no migration.

## API surface

None. Every destination is a shipped page:

- `/articles/new` (`articles-crud.md` § UI surface)
- `/me` (`profile.md` § UI surface)
- `/me/articles` (`articles-crud.md` § UI surface)
- `/me/edit` (`profile.md` § UI surface)

## UI surface

- `components/auth/Header.tsx` — grows a `Write` `<Link>` in the
  signed-in nav branch, rendered before the `<AccountMenu>` so it
  reads as the primary CTA.
- `components/auth/AccountMenu.tsx` — the dropdown gains three
  `<Link role="menuitem">` items above the existing `<form
  action="/api/logout">`. The `useEffect` outside-click handler
  and the `useState` open/close still apply — links close the menu
  naturally via navigation.

### Menu ordering rationale

- **Your profile → Your articles → Settings → Log out.** Profile is
  the "you as a user" entry; articles is the "you as an author"
  entry; settings is the "change your data" entry. Log out is a
  terminating action and stays last — an accidental keyboard
  `Enter` on a wrong item shouldn't sign the user out.

## Testing seams

None. Every branch is a session-shape branch already covered by
the `auth()` mock the existing header tests use.

## E2E test plan

- `e2e/tests/nav/signed-in-header.spec.ts` — Write link visible /
  invisible by session; AccountMenu items navigate to their
  destinations; anonymous fallback unchanged. `@smoke @regression`
- No API tests — this slice adds no endpoints.

Reuses the existing session fixtures from
`e2e/support/factories/user.factory.ts`; no new factories.

## Open questions

None — link labels and destinations are the ones the shipped
pages already own. If we ever add avatar upload or notifications,
each is its own slice.
