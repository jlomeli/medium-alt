# Spec: Profile (view / edit / public)

Tracking: #TBD
Status: draft
Owner: jlomeli

## Intent

Second real feature. Gives every user a canonical page (their own dashboard
plus a public view others can see) and lets them edit the bits of their
account that aren't credentials. Small surface — the hard content-oriented
work (articles, comments, follows) is deliberately deferred to their own
slices — but it exercises the full read-then-write CRUD loop end-to-end
against a real Prisma model for the first time.

## User stories

- As a signed-in user, I want to see my own profile at `/me` so I know
  what's on record.
- As a signed-in user, I want to edit my name, username, and bio at
  `/me/edit` so I can keep the information current.
- As anyone (signed in or not), I want to view another user's public
  profile at `/profiles/:username`.
- As anyone, I want an unknown username at `/profiles/:username` to
  return a real 404 rather than an empty page.
- As an integrator, I want a REST endpoint that returns the current user's
  profile and one that updates it, so any future client (mobile, CLI) can
  reuse the auth surface without scraping HTML.

## Acceptance criteria

Each becomes one Playwright test. Grouped by journey.

### Own profile (`/me`)

- [ ] Signed-in visitor lands on `/me` and sees the fields set at register
  time: name, username, bio (blank on a fresh account), email.
- [ ] Page has a visible "Edit profile" link that navigates to `/me/edit`.
- [ ] Signed-out visitor is redirected to `/login?callbackUrl=%2Fme`
  (already covered by the auth logout test; kept named here for
  spec-completeness).

### Edit profile (`/me/edit`)

- [ ] Form fields are pre-filled with the user's current name, username,
  and bio.
- [ ] Submitting valid changes updates the row and redirects to `/me`,
  where the new values render.
- [ ] Duplicate username surfaces an inline "username taken" error and
  does not update the row.
- [ ] Username failing policy (< 3 chars, disallowed characters) surfaces
  an inline field-level error and does not submit.
- [ ] Bio longer than the max length is rejected with an inline error.
- [ ] Signed-out visitor to `/me/edit` is redirected to
  `/login?callbackUrl=%2Fme%2Fedit`.

### Public profile (`/profiles/:username`)

- [ ] Public visitor sees the target user's name, username, and bio (never
  their email, never any linked internal ids).
- [ ] Unknown username returns HTTP 404 rendered as the app's not-found
  page (not a soft-404 200 with empty content).
- [ ] Signed-in visitor visiting their *own* `/profiles/:username` sees an
  "Edit profile" affordance; visiting someone else's does not.

### API

- [ ] `GET /api/me` — 200 for signed-in caller; 401 when unauthenticated.
  Response body includes `id`, `email`, `username`, `name`, `bio`.
- [ ] `PATCH /api/me` — 200 on valid partial update, 401 when
  unauthenticated, 400 with field-scoped error on invalid input, 400 with
  `code: "username-taken"` on collision.
- [ ] `GET /api/users/{username}` — 200 for known user (`username`,
  `name`, `bio`; no `email`, no `id`), 404 for unknown.

### OpenAPI coverage

- [ ] All three new endpoints appear in `/api/openapi.json` — enforced by
  the coverage guard added in docs/specs/api-docs.md.

## Non-goals

- **Avatar upload.** Deferred to the Articles slice where the UploadThing
  wiring lands (image uploads for article headers). Until then `User.image`
  stays untouched and the UI shows initials.
- **Email change.** Requires a verify-new-email flow that's out of scope
  for v1.
- **Password change from the profile page.** Password-reset request →
  confirm is the supported path; a separate "change password while
  logged in" surface is a Phase-2 exercise.
- **Delete account.**
- **Following / followers counts.** Belongs with the Follow feature.

## Data model delta

None. `User` already has `name`, `username`, `email`, `image`, `bio`. All
the fields this feature reads or writes exist today. No migration.

## API surface

| Method | Path                       | Auth | Input (Zod)          | Output                                                    |
| ------ | -------------------------- | ---- | -------------------- | --------------------------------------------------------- |
| GET    | `/api/me`                  | Yes  | —                    | `MeResponse`: `{ id, email, username, name, bio }`        |
| PATCH  | `/api/me`                  | Yes  | `UpdateMeInput`      | `MeResponse`; 400 → `{ error: { field, code, message? } }`|
| GET    | `/api/users/{username}`    | No   | —                    | `PublicProfile`: `{ username, name, bio }` or 404         |

Zod schemas live under `lib/validation/profile.ts`.

- `updateMeSchema` — partial: `{ name?, username?, bio? }`. Empty payload
  is a 400. All fields optional individually; at least one required.
- `usernameSchema` — reused verbatim from `lib/validation/auth.ts`.
- `bioSchema` — `z.string().max(280)` (single-tweet length; substrate
  choice, not a product opinion).

## UI surface

- `/me` — server component, calls `auth()`, redirects to `/login` if no
  session (already the current placeholder's shape). Renders the current
  user's name, username, email, bio, plus a "Edit profile" link.
- `/me/edit` — server-component gate + client form. Fields prefilled from
  the current user, POSTs to `PATCH /api/me`, redirects to `/me` on
  success, renders field-level errors inline on 400.
- `/profiles/[username]` — server component. Looks up the user; renders
  name / username / bio or triggers `notFound()` which shows the built-in
  Next 404 page. If the viewer is the same user, shows the "Edit profile"
  affordance for symmetry with `/me`.

Shared components (`components/profile/`):

- `<ProfileHeader>` — displays name/username/bio uniformly on both `/me`
  and `/profiles/:username`.
- `<InitialsAvatar>` — placeholder for the eventual `<Avatar>` component;
  shows the user's initials in a coloured circle.
- `<ProfileForm>` — the `/me/edit` client form. Shares layout patterns
  with the auth forms (labels above inputs, inline `role="alert"` errors).

All fields carry visible labels; every interactive element is reachable
via `getByRole` / `getByLabel` — no `data-testid`.

## Testing seams

None.

## E2E test plan

- `e2e/tests/profile/own.spec.ts` — dashboard journey — `@smoke`
- `e2e/tests/profile/edit.spec.ts` — happy path + inline errors — `@regression`
- `e2e/tests/profile/public.spec.ts` — public view + 404 — `@smoke`
- `e2e/api/profile/me.spec.ts` — GET + PATCH contract — `@smoke @api`
- `e2e/api/profile/user.spec.ts` — public GET contract — `@regression @api`

Fixtures needed:

- Nothing new. `userFactory.create()` + `loggedInPage` cover every
  precondition. Two of the tests do need a *second* factory user (e.g. the
  duplicate-username case); factory calls compose fine.

## Open questions

None — defaults locked in below.
