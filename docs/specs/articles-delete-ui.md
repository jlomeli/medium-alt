# Spec: Article delete UI

Tracking: #28
Status: draft
Owner: jlomeli

## Position in the roadmap

Amendment / implementation-follow-on to
[`docs/specs/articles-crud.md`](articles-crud.md) (slice 4a). The
parent spec's § Delete acceptance criteria (L96-100) already state:
"Author can DELETE via the button on the edit page." The endpoint
(`DELETE /api/articles/{slug}`) shipped with slice 4a but the UI
button never landed — this spec pins down the confirmation flow the
parent spec deliberately left implicit and produces the failing
Playwright test that unblocks the implementation.

Deliberately scoped tight:

- **In:** the Delete button on `/articles/[slug]/edit`, its confirm
  dialog, keyboard behaviour, and the post-delete redirect.
- **Out:** delete row-actions on `/me/articles`, undo / soft-delete,
  bulk delete, and admin-side deletion. Each is a Phase-2 concern
  with its own UX surface.

## Intent

The delete endpoint is fully implemented (cascade-cleanup of cover
+ inline images, 204 on success, 404 anti-enumeration on
non-authors) but has no reachable UI trigger. The gap has real
consequences: a signed-in author who wants to delete an article
either has to fire a `DELETE` from devtools or use the OpenAPI
docs page. Both are hostile to normal use.

This slice adds the missing button and its confirmation prompt.
The confirmation is non-optional (destructive action, cascade
scope includes image storage), and the flow lives on the edit
page so the author is already in "manage this article" mind.

## User stories

- As the author of an article (draft or published), I want a
  `Delete` button on the edit page so I can remove articles I no
  longer want without asking a developer.
- As the author about to delete, I want an explicit "are you sure?"
  step that names the article by title so I can't nuke the wrong
  row by mis-clicking.
- As the author after a successful delete, I want to land on my
  `/me/articles` list so I can immediately confirm the row is gone
  and continue managing other work.
- As the author on the confirm dialog, I want `Escape` to cancel
  without any DB write — keyboard escape is the universal "get me
  out of this" signal.

## Acceptance criteria

Each becomes one Playwright test. Grouped by journey.

### Delete affordance on `/articles/[slug]/edit`

- [ ] Author viewing their own draft's edit page sees a
  `getByRole('button', { name: 'Delete article' })`. It renders as
  a secondary/destructive style (border + red text), visually
  separated from the primary `Save draft` / `Publish` submit.
- [ ] Author viewing their own **published** article's edit page
  sees the same button in the same location. Delete does not care
  about publish state.
- [ ] Non-author never reaches this page (existing 404 behaviour
  from `articles-crud.md`), so the button's absence there is a
  regression of the parent spec, not a new case here.

### Confirm dialog

- [ ] Clicking `Delete article` opens a modal / dialog
  (`role="dialog"`, `aria-labelledby` bound to the heading, focus
  trapped inside).
- [ ] The dialog heading is `Delete "<article title>"?` — the
  literal title is interpolated so the author reads the row they're
  about to remove.
- [ ] The dialog body includes the sentence "This will also
  delete the cover image and any inline images uploaded to this
  article." (Matches the actual cascade in
  `app/api/articles/[slug]/route.ts` § DELETE; setting expectation
  avoids a "why did my image disappear?" support question.)
- [ ] Two buttons: `Cancel` (secondary, focus lands here on open)
  and `Delete` (destructive primary). `Cancel` closes the dialog
  with no network call. `Delete` fires the DELETE.
- [ ] Pressing `Escape` closes the dialog with no network call.
- [ ] Clicking the backdrop closes the dialog with no network call.
- [ ] While the DELETE is in flight, the `Delete` button is
  disabled with "Deleting…" text; a second click cannot land a
  duplicate DELETE.

### Post-delete flow

- [ ] On 204 the browser navigates to `/me/articles`. The just-
  deleted article's row is absent from the table on that page.
- [ ] The success flash / toast is optional — the row's absence
  from `/me/articles` is the confirmation. (No toast lands in this
  slice; a global toast surface is Phase 2.)
- [ ] On a 404 response (e.g. tab open on an article deleted by a
  concurrent session), the dialog surfaces "This article has
  already been removed." with a single `OK` button that navigates
  to `/me/articles`. No stack trace, no console error.
- [ ] On a 401 response (session expired between page load and
  click), the dialog surfaces "Please sign in again to delete
  this article." with a link to `/login?callbackUrl=<current-edit-url>`.
- [ ] On a 5xx or network failure, the dialog surfaces "Couldn't
  delete this article. Please try again." and re-enables the
  `Delete` button so a retry is a real retry.

### Accessibility

- [ ] Focus returns to the `Delete article` button when the dialog
  closes via `Cancel`, `Escape`, or backdrop click.
- [ ] The dialog's initial focus is on `Cancel`, not on `Delete`,
  so a stray `Enter` keystroke while the dialog opens does not
  confirm the destructive action.
- [ ] Screen-reader announcement includes the interpolated title
  (via the heading + `aria-labelledby`).

## Non-goals

- **Delete from the article read view (`/articles/[slug]`).** The
  edit page is the canonical "manage" surface; adding a second
  entry point duplicates the confirm-dialog logic for no user
  gain in v1.
- **Delete row-action on `/me/articles`.** Would require the same
  confirm-dialog + error-handling surface duplicated per row. If
  we want a bulk-manage flow later, that's its own slice.
- **Soft delete / undo.** No `deletedAt` column; the row is gone.
  Recovering a deleted article is a Phase-2 admin concern.
- **Type-to-confirm ("type the slug to delete").** Two-step
  dialog with focus-defaulted-to-Cancel is enough friction for a
  personal-blog scale product.
- **Bulk delete.** One row at a time.
- **Global toast / success-flash surface.** Absent-row on
  `/me/articles` is the confirmation. A shared toast component is
  its own slice; deferring keeps this spec's surface minimal.

## Data model delta

None. `DELETE /api/articles/{slug}` already exists.

## API surface

None. Endpoint is unchanged. This slice consumes:

| Method | Path                    | Auth | Behaviour                                                        |
| ------ | ----------------------- | ---- | ---------------------------------------------------------------- |
| DELETE | `/api/articles/{slug}`  | Yes  | 204 on success; 404 for non-author or missing row; 401 anon.     |

See `articles-crud.md` § API surface and
`app/api/articles/[slug]/route.ts` for cascade semantics.

## UI surface

- `app/articles/[slug]/edit/page.tsx` — hosts the button + dialog.
  Existing page; grows a new component slot below the
  `<ArticleForm>`.
- **`components/articles/ArticleForm.tsx` — loses its existing
  delete path.** Today `ArticleForm` owns a `handleDelete` that
  fires `window.confirm(...)` and a `Delete article` button wired
  to it (`ArticleForm.tsx` L176-193, L316). This slice removes
  both. `DeleteArticleButton` becomes the sole delete flow so
  there is exactly one UI trigger, one confirm surface, and one
  error-handling code path. No native `window.confirm` remains
  anywhere in the article-management surface.

Shared components:

- `<DeleteArticleButton slug={string} title={string} />` —
  client component. Owns the button, the modal, the redirect via
  `router.push('/me/articles')` + `router.refresh()`, and the
  full pending-state contract:
  - Uses `useTransition`; the `startTransition` callback is an
    `async` function that **awaits** the `fetch(url, { method: 'DELETE' })`
    (and its response handling) so `isPending` stays true for the
    full request lifetime, not just the synchronous dispatch.
  - The `Delete` button inside the dialog binds `disabled={isPending}`
    and renders `Deleting…` while `isPending` is true. No separate
    local `deleting` boolean — a single source of truth prevents
    the "button re-enables mid-request" race the current
    `ArticleForm.handleDelete` is vulnerable to.
  - The trigger button (`Delete article`, outside the dialog) is
    also `disabled={isPending}` so a user cannot reopen the
    dialog mid-request.
- Reuses whatever primitive dialog exists in `components/` if one
  is present; otherwise adds a minimal focus-trap dialog under
  `components/ui/ConfirmDialog.tsx` designed so future destructive
  actions (delete comment, unfollow-with-confirm, delete account)
  can reuse it.

Every affordance is `getByRole` / `getByLabel`-reachable. No
`data-testid`.

## Testing seams

None. The `DELETE` endpoint is called through the same authed
`APIRequestContext` E2E already uses; no factory back door needed.

## E2E test plan

- `e2e/tests/articles/delete.spec.ts` — supersedes the placeholder
  from the parent spec. The existing file uses
  `page.once('dialog', d => d.accept())` against `window.confirm`;
  the replacement targets the reusable `role="dialog"` modal via
  `getByRole('dialog')` and drops all native-dialog handling.
  Covers:
  - **Draft delete happy path** → dialog opens, `Delete` clicked,
    redirect to `/me/articles`, deleted row absent from the table
    (asserted via `getByRole('row', { name: <title> })` being
    not-visible).
  - **Published delete happy path** → same assertions on a
    `published: true` article.
  - **Cancel via `Cancel` button, `Escape`, and backdrop click**
    each close the dialog with **no** `DELETE` fired — asserted
    with a `page.on('request')` collector filtered to
    `request.method() === 'DELETE'` returning empty.
  - **In-flight lockout** — mid-request the `Delete` button
    reports `getByRole('button', { name: 'Deleting…' })` and
    `toBeDisabled()`; a rapid second click cannot land a duplicate
    `DELETE` (verified via `page.on('request')` count === 1). The
    outer `Delete article` trigger is also disabled during the
    transition.
  - **401 handling** — session cleared between page load and
    click; dialog surfaces "Please sign in again to delete this
    article." with a `getByRole('link', { name: /sign in/i })`
    pointing at `/login?callbackUrl=<current-edit-url>`.
  - **Concurrent-delete 404** — article deleted out-of-band via
    the API before clicking `Delete`; dialog surfaces "This
    article has already been removed." with an `OK` button that
    navigates to `/me/articles`. No console errors
    (`page.on('pageerror')` remains silent).
  - **5xx / network failure** — request routed through
    `page.route()` to return `500` (and a separate case aborting
    the request); dialog surfaces "Couldn't delete this article.
    Please try again." and the `Delete` button re-enables so a
    retry is a real retry.
  - **Focus contract** — initial focus lands on `Cancel` (asserted
    via `expect(cancelButton).toBeFocused()` immediately after
    open); focus returns to the `Delete article` trigger when the
    dialog closes via `Cancel`, `Escape`, and backdrop click.
  `@smoke` on the two happy-path tests + the cancel-without-request
  test; `@regression` on the full file.

Fixtures — none new. The existing `articleFactory.create()` seeds
the article to delete.

## Open questions

None. Copy strings above are implementation defaults; wording
tweaks are editable during code review, not before implementation.
