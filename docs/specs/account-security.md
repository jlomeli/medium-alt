# Spec: Account security — change password / change email

Tracking: #29
Status: draft
Owner: jlomeli

## Position in the roadmap

**Phase-2 promotion.** Both surfaces here are listed as Phase-2
deferrals in [`docs/specs/profile.md`](profile.md) § Non-goals
(L86-90):

- "**Email change.** Requires a verify-new-email flow that's out of
  scope for v1."
- "**Password change from the profile page.** Password-reset request
  → confirm is the supported path; a separate 'change password while
  logged in' surface is a Phase-2 exercise."

This spec promotes both to Phase 2 with concrete acceptance criteria.
`profile.md` § Non-goals should be updated to point here when this
lands.

Sliced as one PR because both live on the same page (`/me/edit`),
both extend `PATCH /api/me` (or add a sibling endpoint), and both
share the "current password verification" primitive.

## Intent

A signed-in user today has no in-app way to rotate credentials:

- **Password.** The only path is `/password-reset/request` → email →
  `/password-reset/confirm`, which requires signing out of the session
  the reset link generates. That flow is designed for the "I forgot"
  case, not the routine "I want to rotate this quarterly" case.
- **Email.** No path at all. `updateMeSchema`
  (`lib/validation/profile.ts:24`) omits `email` deliberately.

This slice adds two sections to `/me/edit` (`Change password`,
`Change email`), the endpoints they submit against, and the
verify-new-email round-trip that lets us change the login identifier
without opening an account-takeover vector.

## User stories

- As a signed-in user, I want to change my password from `/me/edit`
  by entering my current password + a new one so I can rotate
  credentials without going through the forgot-password email loop.
- As a signed-in user, I want incorrect current-password submissions
  to fail with a specific, non-leaky error so I know I typed it
  wrong (but an attacker with my session cookie learns nothing new —
  they already have the session).
- As a signed-in user, I want a successful password change to keep
  my current session alive (no forced re-login) so a routine rotation
  isn't disruptive.
- As a signed-in user, I want to change my email from `/me/edit` by
  entering the new address; the system emails a verification link
  to the NEW address, and my login identifier only changes once I
  click it — so a mistyped address (or a stale one) cannot lock me
  out.
- As a signed-in user with a pending email change, I want to see the
  pending state on `/me/edit` and be able to cancel or resend the
  verification email.
- As anyone who receives an email-change verification link, I want a
  stale or reused link to fail with a clear error, not silently
  swap someone's login email.

## Acceptance criteria

Each becomes one Playwright test. Grouped by journey.

### Change password (`/me/edit` § Password)

- [ ] `/me/edit` shows a "Change password" section with three fields:
  `Current password`, `New password`, `Confirm new password`, and a
  submit `Change password`.
- [ ] Submitting valid inputs — correct current password, new
  password meeting policy, confirm matches — updates the argon2id
  hash, keeps the JWT session valid (no forced sign-out), and
  surfaces an inline "Password changed" success indicator.
- [ ] Wrong current password → inline error on the `Current password`
  field: "That password is incorrect." Hash is not updated.
- [ ] New password failing policy (< 8 chars, missing case, missing
  digit — same policy as `auth.md` § Password policy) → inline
  error on `New password`.
- [ ] `New password` = `Current password` → inline error: "New
  password must differ from your current password."
- [ ] `Confirm new password` mismatch → inline error on the confirm
  field.
- [ ] Signed-out visitor to `/me/edit` is redirected as today
  (`/login?callbackUrl=%2Fme%2Fedit`) — the redirect covers the
  password section too, no extra guard needed.

### Change email — request (`/me/edit` § Email)

- [ ] `/me/edit` shows a "Change email" section with the current
  email (read-only), a `New email` input, and a `Send verification`
  submit.
- [ ] Submitting a valid new email creates a pending change (see
  data-model delta) and dispatches a verification email to the NEW
  address containing a one-hour link. The success indicator says
  "Verification sent to <new-email>." The current login email does
  NOT change yet.
- [ ] Submitting an email already in use by another account → same
  generic success indicator (no user-enumeration). No email is
  actually sent; the pending change is not created. This matches
  `password-reset/request` § anti-enumeration behaviour.
- [ ] Submitting an email that equals the current one → inline
  error: "New email must differ from your current email."
- [ ] Submitting a malformed email → inline Zod error.

### Change email — pending state (`/me/edit` § Email)

- [ ] A user with a pending change sees the pending row above the
  input: "Pending: <new-email> — verification sent <relative time>",
  with two buttons: `Resend verification` and `Cancel change`.
- [ ] `Cancel change` deletes the pending row; the section reverts
  to the input form.
- [ ] `Resend verification` POSTs to `/api/me/email/resend`, which
  re-issues a fresh 1-hour token, invalidates the previous one, and
  re-sends the email to the same pending address. UI surfaces
  "Verification resent to <new-email>."
- [ ] While a pending change exists, submitting a DIFFERENT new
  email replaces the pending row (invalidates the old token, issues
  a new one). Same "one pending change per user" invariant enforced
  by a unique index (see data-model delta).

### Change email — confirm (`/settings/email/confirm?token=…`)

- [ ] Clicking a valid link swaps `User.email` to the new address,
  deletes the pending row, deletes the token, keeps the JWT session
  alive, and lands on `/me` with an inline "Email updated" indicator.
- [ ] A link older than 1 hour → error page: "This link has
  expired. Request a new verification email from your settings."
- [ ] A reused link → error page: "This link is no longer valid."
  (Both stale + reused collapse to the same shape; the pending
  row is either gone or the token has been rotated.)
- [ ] A link whose token doesn't match any row → same "no longer
  valid" error. No stack trace, no ambient leak.
- [ ] If the target new-email address has been claimed by another
  account since the verification was sent → error page: "That
  email is now in use by another account." Pending row is deleted;
  session unaffected.
- [ ] Anonymous visitor with a valid link → same 200 confirm page.
  Session is not required to confirm; the token itself is the
  authorization. (Same shape as password-reset confirm.)

### API contract

- [ ] `POST /api/me/password` — signed-in, correct current + valid
  new → `200 { ok: true }`. Hash updated, session preserved.
- [ ] `POST /api/me/password` — wrong current → `400 { error: {
  field: "currentPassword", code: "invalid" } }`. Hash unchanged.
- [ ] `POST /api/me/password` — new fails policy → `400 { error: {
  field: "newPassword", code: "weak" | "out-of-range" } }`.
- [ ] `POST /api/me/password` — new = current → `400 { error: {
  field: "newPassword", code: "same-as-current" } }`. Hash
  unchanged.
- [ ] `POST /api/me/password` — anonymous → `401 { error: {
  code: "unauthenticated" } }`.
- [ ] `POST /api/me/email` — signed-in, valid new email → `202 {
  pending: true }`. Pending row is committed FIRST, then the
  verification email is dispatched (see § Delivery ordering below).
- [ ] `POST /api/me/email` — email already in use → same `202 {
  pending: true }` (anti-enumeration). No email sent, no pending
  row created.
- [ ] `POST /api/me/email` — new = current → `400 { error: {
  field: "newEmail", code: "same-as-current" } }`.
- [ ] `POST /api/me/email` — anonymous → `401`.
- [ ] `POST /api/me/email/resend` — signed-in, pending row exists
  → `204`. Rotates the token (invalidates the previous one),
  updates `expiresAt` to now + 1h, re-dispatches to the same
  pending address.
- [ ] `POST /api/me/email/resend` — signed-in, no pending row →
  `404 { error: { code: "no-pending" } }`. UI only exposes the
  Resend button when a pending row is present; the 404 is
  defense-in-depth against tab-race cancellation.
- [ ] `POST /api/me/email/resend` — anonymous → `401`.
- [ ] `POST /api/me/email/cancel` — signed-in, pending row exists
  → `204`, row deleted.
- [ ] `POST /api/me/email/cancel` — signed-in, no pending row →
  `204` (idempotent).
- [ ] `POST /api/me/email/confirm` — body `{ token }`, valid,
  unexpired → `200 { email: <new> }`. Row swapped, token consumed.
- [ ] `POST /api/me/email/confirm` — expired or reused token →
  `400 { error: { field: "token", code: "invalid" } }`.
- [ ] `POST /api/me/email/confirm` — new email now in use by
  another account → `409 { error: { field: "email", code: "in-use" } }`.
  Pending row is deleted; token consumed.

### OpenAPI coverage

- [ ] All five new endpoints (`POST /api/me/password`,
  `POST /api/me/email`, `POST /api/me/email/resend`,
  `POST /api/me/email/cancel`, `POST /api/me/email/confirm`) appear
  in `/api/openapi.json` — enforced by the coverage guard from
  [`api-docs.md`](api-docs.md).

## Non-goals

- **"Change username" from `/me/edit`.** Username IS already
  editable via `PATCH /api/me`; this slice doesn't touch it.
- **Two-factor / passkeys.** Same Phase-2 status as
  [`auth.md`](auth.md) § Non-goals; not promoted here.
- **"Log out of all other devices" after password change.** JWT
  sessions can't be server-side revoked without a session-store
  migration (see `auth.md` § Session strategy). Rotating the JWT
  secret is a global blast-radius change; per-user revoke would
  require the DB-session migration listed as a Phase-2 exercise
  there.
- **Password strength meter UI.** Same Phase-2 status as `auth.md`.
- **Email change history.** Only the current email is stored; a
  swap replaces it.
- **Multiple email addresses per account** (primary + alias).
- **Notifying the OLD email address when it changes.** Nice to have
  from a security-hygiene perspective (catches account takeover);
  deferred to keep this slice's dispatch surface single-recipient.
  Track as a follow-on if needed.
- **Rate limiting.** Same Phase-2 hold as the rest of the write
  surface (`auth.md` § Non-goals).
- **Delete account.** Explicitly deferred by `profile.md` §
  Non-goals; this spec doesn't cover it.

## Data model delta

New `PendingEmailChange` model. Existing `User.email` stays as the
authoritative login identifier; a swap is atomic on confirm.

```prisma
model PendingEmailChange {
  id         String   @id @default(cuid())
  userId     String   @unique
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  newEmail   String
  tokenHash  String   @unique
  expiresAt  DateTime
  createdAt  DateTime @default(now())

  @@index([expiresAt])
}
```

Add on `User`:

```prisma
pendingEmailChange PendingEmailChange?
```

Migration: `pnpm db:migrate --name account-security-add-pending-email-change`.
This migration is follow-on work owned by the feature-implementation
PR — the docs-only PR that lands this spec deliberately does NOT
create the migration; it lands alongside the code that uses it.

### Token strategy

- Reuses the `password-reset` primitive from
  [`lib/auth/reset-token.ts`](../../lib/auth/reset-token.ts):
  `generate()` returns `{ raw, hash }` where `raw` = 32-byte
  `crypto.randomBytes` hex-encoded (64 chars) and `hash` =
  `createHash("sha256").update(raw).digest("hex")`. Only `hash` is
  stored in `PendingEmailChange.tokenHash`; `raw` goes in the
  verification link. Confirm recomputes `hash(raw)` and looks the row
  up by `tokenHash`. Same helper, same deterministic convention — one
  hashing primitive across the auth surface.
- 1-hour TTL. Symmetric with password-reset for a shared reader
  mental model.
- Single-use. Confirm consumes the row (either happy path or
  409); no need for a separate consumed flag.
- Only one pending change per user at a time — enforced by
  `@unique` on `userId`. A second `POST /api/me/email` REPLACES
  the row (invalidates the previous token).

### Delivery ordering (DB / mail boundary)

For `POST /api/me/email` and `POST /api/me/email/resend`, the
handler MUST:

1. Open a Prisma transaction, `upsert` the `PendingEmailChange` row
   (rotating `tokenHash` + `expiresAt`), and COMMIT.
2. Only after the commit succeeds, hand the raw token to the
   verification-email dispatcher.

Rationale: dispatching before commit lets a rollback (unique-index
race, connection drop) leak a link the DB will never recognise —
confirm always returns `400 invalid`, and the user has no way to
cancel or resend from the UI (they don't have a pending row). The
inverse failure mode — commit succeeds, mail dispatch fails — is
strictly better: the pending row is visible on `/me/edit`, so the
user can hit `Resend verification` (which re-dispatches) or `Cancel
change`. A mail-dispatch failure therefore surfaces as an inline
warning on the 202 response's success indicator ("Verification is
pending — if the email doesn't arrive, try Resend."). We do not
need a full outbox pattern for this slice — a synchronous
after-commit dispatch is sufficient given the resend affordance —
but the ordering is a correctness requirement, not a nice-to-have.

The same ordering rule applies to `/confirm` in reverse: swap
`User.email` and delete the pending row inside one transaction so
a mid-flight failure can't leave `User.email` swapped while the
pending row (with its now-consumable token) still exists.

### Anti-enumeration on `POST /api/me/email`

If the new email is already in use by another account, respond
with the same `202 { pending: true }` shape as the happy path,
without sending an email or creating a pending row. Matches the
existing `password-reset/request` behaviour and keeps the endpoint
from being an email-enumeration oracle.

### `POST /api/me/password` verification

- `currentPassword` verified via the same argon2id path as
  `POST /api/login` (share the helper in `lib/auth/password.ts`).
- On success, rehash the `newPassword` (argon2id, current params)
  and `UPDATE User SET passwordHash = $1 WHERE id = $2`.
- Session preservation: the JWT is signed off `User.id`, which
  doesn't change on a password rotation — no cookie clear needed.

## API surface

| Method | Path                          | Auth   | Input (Zod)                                | Output                                                             |
| ------ | ----------------------------- | ------ | ------------------------------------------ | ------------------------------------------------------------------ |
| POST   | `/api/me/password`            | Yes    | `{ currentPassword, newPassword }`         | `200 { ok: true }`; `400 { error: { field, code, message? } }`; `401` |
| POST   | `/api/me/email`               | Yes    | `{ newEmail }`                             | `202 { pending: true }`; `400`; `401`                              |
| POST   | `/api/me/email/resend`        | Yes    | *(none)*                                   | `204`; `404 { error: { code: "no-pending" } }`; `401`              |
| POST   | `/api/me/email/cancel`        | Yes    | *(none)*                                   | `204` (idempotent); `401`                                          |
| POST   | `/api/me/email/confirm`       | mixed  | `{ token }`                                | `200 { email }`; `400`; `409 { error: { field: "email", code: "in-use" } }` |

Zod schemas live under `lib/validation/account.ts` (new module —
keeps `lib/validation/profile.ts` narrowly about profile-shape
fields, not credentials):

- `changePasswordSchema` = `{ currentPassword: z.string().min(1),
  newPassword: passwordSchema }` (reuses the existing
  `passwordSchema` from `lib/validation/auth.ts`).
- `changeEmailSchema` = `{ newEmail: emailSchema }` (reuses).
- `confirmEmailChangeSchema` = `{ token: z.string().length(64).regex(/^[0-9a-f]+$/) }`
  (mirrors password-reset's token schema).

### Error shape

Same `{ error: { field, code, message? } }` envelope as the rest
of the write surface. New codes:

- `POST /api/me/password`: `field: "currentPassword", code: "invalid"`;
  `field: "newPassword", code: "same-as-current" | "weak" | "out-of-range"`.
- `POST /api/me/email`: `field: "newEmail", code: "same-as-current" |
  "invalid"`.
- `POST /api/me/email/resend`: `code: "no-pending"` (with `404`, no
  `field` — the failure isn't attached to a submitted input).
- `POST /api/me/email/confirm`: `field: "token", code: "invalid"`;
  `field: "email", code: "in-use"` (with `409`).

## UI surface

- `/me/edit` — existing page. Grows two additional `<section>`s
  below the current profile form: `Change password` and
  `Change email`. Each is its own `<form>` with its own submit /
  success indicator; they never share submit state with the
  profile form or with each other.
- `/settings/email/confirm` — new page. Reads `?token=` from the
  query, POSTs to `/api/me/email/confirm`, and renders success /
  error variants. Same shape as `/password-reset/confirm`.

Shared components under `components/account/`:

- `<ChangePasswordSection />` — client component, three fields +
  submit + inline errors. Encapsulates the fetch to `/api/me/password`.
- `<ChangeEmailSection pending={PendingEmailChange | null} />` —
  client component. When `pending === null`: renders the empty
  input form (New email + Send verification). When `pending !==
  null`: renders BOTH the pending banner (with `Resend
  verification` + `Cancel change` buttons) AND the input form
  below it, so a user who typed the wrong address can submit a
  different one without a Cancel-first round-trip — that submission
  atomically replaces the pending row (see acceptance criteria §
  Change email — pending state). The input's submit label stays
  `Send verification`; the "one pending change per user" invariant
  on the server enforces the replacement semantic.
- Reuses field-level error rendering from the existing
  `<EditProfileForm>` so the visual grammar of inline errors stays
  consistent.

Every affordance is `getByRole` / `getByLabel`-reachable. No
`data-testid`.

## Testing seams

- **Email inbox.** Reuses the existing Mailpit dev SMTP dependency
  (`docker-compose.yml`) — same primitive the password-reset E2E
  already asserts against. No new test-only endpoint needed.
- **Token expiry.** Reuses the pattern from
  `app/api/test/password-reset/expire/route.ts` — add
  `POST /api/test/email-change/expire` gated on `NODE_ENV !== "production"`
  so the "stale link" test can advance the DB clock without
  waiting an hour. Same guard, same auditability.

## E2E test plan

- `e2e/tests/account/change-password.spec.ts` — happy path,
  wrong current, weak new, same-as-current, session survives.
  `@smoke @regression`
- `e2e/tests/account/change-email-happy.spec.ts` — request →
  Mailpit → click link → email swapped, session survives, `/me`
  reflects new email. `@smoke`
- `e2e/tests/account/change-email-pending.spec.ts` — resend
  invalidates old token, cancel removes pending row, second
  request replaces pending row. `@regression`
- `e2e/tests/account/change-email-errors.spec.ts` — expired
  link (via `/api/test/email-change/expire`), reused link,
  now-in-use conflict. `@regression`
- `e2e/api/account/password.spec.ts` — `POST /api/me/password`
  contract, auth + authz + validation. `@smoke @api @regression`
- `e2e/api/account/email.spec.ts` — `POST /api/me/email` +
  `/cancel` + `/confirm` contracts, anti-enumeration on already-
  used email. `@smoke @api @regression`

Fixtures wired as part of this slice:

- `pendingEmailChangeFactory.create(userApi, { newEmail })` — POSTs
  to `/api/me/email`, reads the pending row via a service call
  so tests can assert on the token expiry without scraping Mailpit.
- Reuses `mailpit` helper from the password-reset E2E suite; no
  new mailbox primitive.

## Open questions

- **Should the OLD email address receive a security notification
  when the change confirms?** Called out as a non-goal above;
  worth revisiting after we ship. Not a blocker.
- **Should password change invalidate the current JWT and issue
  a fresh one?** Current design preserves the session. If we
  ever migrate to DB-backed sessions (see `auth.md` § Session
  strategy), rotating on password change becomes trivial and
  the answer flips to "yes". No decision blocked today.
