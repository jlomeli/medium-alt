# Spec: Authentication

Tracking: #3
Status: draft
Owner: jlomeli

## Intent

The first real user-facing feature. Everything downstream (profile, article
CRUD, comments, claps, follows) needs a signed-in user, so auth blocks the
critical path. It's also the first exercise for the whole loop — spec → failing
E2E → wired factory → `loggedInPage` fixture → agentic review. We deliberately
keep the surface small and the token lifecycle predictable so the *framework*
work stays in focus.

## User stories

- As a new visitor, I want to register with email + username + password so I can start writing.
- As a returning user, I want to log in with email + password so I can access my drafts.
- As a signed-in user, I want to log out so my session ends on this device.
- As a user who forgot their password, I want to request a reset link by email and set a new password so I can regain access.
- As a signed-out user visiting a protected page, I want to be sent back to that page after signing in.

## Acceptance criteria

Each becomes one Playwright test. Grouped by journey.

### Register

- [ ] Register with valid inputs creates the user, auto-signs them in, and lands on `/` (or `callbackUrl`).
- [ ] Register with an already-used email shows an inline "email already registered" error; no user is created.
- [ ] Register with an already-used username shows an inline "username taken" error.
- [ ] Register with a weak password (<8, or missing upper/lower/digit) shows inline field-level errors and does not submit.
- [ ] Register with a malformed email shows an inline "email invalid" error.
- [ ] All form inputs are reachable via `getByLabel(...)` — no `data-testid` needed.

### Login

- [ ] Login with valid credentials lands the user on `/`.
- [ ] Login with wrong password shows a generic "email or password incorrect" error (no user-enumeration).
- [ ] Login with an unknown email shows the same generic error.
- [ ] Login with `?callbackUrl=/me` and valid credentials lands the user on `/me`.
- [ ] `callbackUrl` pointing to an external origin (e.g. `https://evil.example`) is ignored — user lands on `/`.
- [ ] Already-signed-in user visiting `/login` is redirected to `/`.

### Logout

- [ ] Logout ends the session and lands the user on `/`.
- [ ] After logout, hitting a protected page redirects to `/login?callbackUrl=<original>`.

### Password reset

- [ ] Requesting a reset for a real email sends an email (visible in Mailpit); the UI shows a generic "check your email" response (no user-enumeration).
- [ ] Requesting a reset for an unknown email returns the same generic response.
- [ ] Following a valid reset link opens the confirm form; submitting a valid new password updates the hash and auto-signs the user in.
- [ ] Reset links expire after 1 hour — a stale link shows an "link expired" error.
- [ ] A reset link can only be used once — a reused link shows an "link invalid" error.

## Non-goals

- Social login (Google/GitHub) — Auth.js supports it; we're keeping the surface minimal.
- Email verification on register — users are signed in immediately.
- Two-factor / passkeys.
- Password strength meter UI.
- Rate limiting on login / reset endpoints — deferred to Phase 2 as a framework exercise.
- "Log out of all devices" / session management UI.

## Session strategy

**JWT sessions.** Auth.js v5's Credentials provider only supports JWT sessions
out of the box; DB sessions with Credentials require manual `signIn` + `jwt`
callback wiring (creating a `Session` row and threading the sessionToken
through the JWT). That's non-trivial and doesn't buy us anything for v1.

The existing `Session` table in `prisma/schema.prisma` stays — it's harmless
and reserved for OAuth providers if we ever add them. Migrating to DB sessions
is a good Phase-2 framework exercise (unlocks server-side revoke).

## Password policy

- Minimum 8 characters.
- Must include ≥1 uppercase, ≥1 lowercase, ≥1 digit.
- No special-character requirement — deliberately: broader compatibility,
  simpler E2E test data.
- Stored as **argon2id** hash via the `argon2` npm package (native N-API
  bindings; memory-hard). Parameters live in `lib/auth/password.ts` and start
  at library defaults (`memoryCost=65536`, `timeCost=3`, `parallelism=4`);
  tune down if Vercel cold-start login latency exceeds ~250 ms.

## Data model delta

Add `PasswordResetToken`. Auth.js's built-in `VerificationToken` model has a
different shape (compound key on `identifier + token`) and is reserved for
Auth.js internals — keeping them separate keeps intent readable.

```prisma
model PasswordResetToken {
  id        String    @id @default(cuid())
  tokenHash String    @unique          // sha256 of the raw token; raw token only in the email link
  userId    String
  expiresAt DateTime
  usedAt    DateTime?
  createdAt DateTime  @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

No change to `User` beyond what's already scaffolded (`passwordHash`,
`username`, `email` are already there).

Migration: `pnpm db:migrate --name auth-add-password-reset-token`.

## API surface

Auth.js owns `/api/auth/[...nextauth]` — login/logout/session/csrf are handled
there. Register + password reset are custom Route Handlers so we control the
error taxonomy.

| Method   | Path                          | Auth  | Input (Zod)                                          | Output                                             |
| -------- | ----------------------------- | ----- | ---------------------------------------------------- | -------------------------------------------------- |
| POST     | `/api/register`               | No    | `RegisterInput` — `{ email, username, password, name? }` | `201` → `{ user: { id, email, username } }` <br>`400` → `{ error: { field, code } }` |
| GET/POST | `/api/auth/[...nextauth]`     | mixed | Auth.js built-ins + Credentials `{ email, password }` | Auth.js JSON                                       |
| POST     | `/api/password-reset/request` | No    | `{ email }`                                          | Always `200` → `{ ok: true }` (no user-enumeration) |
| POST     | `/api/password-reset/confirm` | No    | `{ token, newPassword }`                             | `200` → `{ ok: true }`; `400` → `{ error: "expired" \| "invalid" \| "weak-password" }` |

Zod schemas live under `lib/validation/auth.ts` and are the single source of
truth for both server validation and client field-level errors.

Server-side rules:

- **Register:** hash password with argon2 → insert User → return 201. Duplicate
  email or username is a 400 with a `field`-scoped `code` (`email-taken` /
  `username-taken`) so the UI can attach the error to the right input.
- **Password-reset request:** always returns `200 { ok: true }`. Only if the
  user exists → generate a raw token (32 bytes hex), store `sha256(token)` in
  `PasswordResetToken`, email the link `${APP_URL}/password-reset/confirm?token=<raw>`.
- **Password-reset confirm:** look up token by `sha256(token)`. Verify not
  expired, not used. Update `passwordHash`, mark `usedAt`, invalidate any
  other outstanding tokens for that user.

## UI surface

- `/register` — email, username, password, (optional) name. On success →
  auto-login → redirect to `callbackUrl` or `/`.
- `/login` — email, password. Honors `?callbackUrl=`. "Forgot password?" link
  → `/password-reset/request`.
- `/password-reset/request` — email input. Always shows generic
  "check-your-email" success page.
- `/password-reset/confirm?token=…` — new password + confirm. On success,
  auto-login and land on `/`.
- Header component: signed-out shows "Log in" / "Sign up"; signed-in shows
  the user's menu with "Log out".

Components (`components/auth/`):

- `<AuthForm>` — shared shell (heading, submit button, error region).
- `<PasswordField>` — controlled input with show/hide toggle, `aria-describedby`
  wired to hint text.

All fields have visible labels. `<AuthForm>` uses `<form>` semantics so tests
query `getByRole('form', { name: ... })` and inputs via `getByLabel`.

## Testing seams

Two behaviors — reset-token expiry, and any other future time-dependent
assertion — need a way for E2E tests to fast-forward without wall-clock waits.

- `POST /api/test/password-reset/expire { token }` — dev/test-only Route
  Handler that marks the matching `PasswordResetToken.expiresAt` in the past.
  Guarded: **must return 404 unless `NODE_ENV !== "production"` AND
  `process.env.E2E === "1"`**. CI sets `E2E=1` in the E2E workflow env; the
  Vercel preview build sets it too so preview traffic can hit it.
- Rationale over Prisma direct-writes from tests: keeps the E2E process
  hermetic (no DB creds in the runner), keeps the seam observable in HAR/traces.

Add more seams here as future features need them; each one must be gated the
same way. Two independent skip tags exist so a test's dependencies are
declarative:

- `@needs-test-seam` — needs an `E2E=1`-gated backdoor: the `/api/test/*`
  endpoints, the on-disk upload stub (`app/api/__test-uploads/[key]/route.ts`
  + the `E2EStubStorage` adapter routed through `/api/uploadthing`), or any
  future seam under the same gate. Runs on local dev and `ci.yml`
  (`E2E=1` in `pnpm dev`); skipped on the preview e2e job and nightly
  because neither the Vercel preview nor production ships with `E2E=1`
  and the on-disk stub has no place to write on serverless anyway.
- `@needs-mailpit` — needs Mailpit reachable at `localhost:8025`.

Both the nightly-full job (against `PRODUCTION_URL`) and the PR e2e job
(against a Vercel preview) `--grep-invert "@needs-test-seam|@needs-mailpit"`
because neither reaches Mailpit and only PR previews reach the seams. The
`ci.yml` quality job runs both tags with the service containers attached
(`api` project only). See `.github/workflows/`.

## E2E test plan

- `e2e/tests/auth/register.spec.ts` — happy path + inline-error variants — `@smoke @regression`
- `e2e/tests/auth/login.spec.ts` — happy path + wrong-password + `callbackUrl` — `@smoke`
- `e2e/tests/auth/logout.spec.ts` — happy path — `@smoke`
- `e2e/tests/auth/password-reset.spec.ts` — request → Mailpit → confirm → signed in — `@regression`
- `e2e/api/auth/register.spec.ts` — 201, 400 on duplicate, 400 on invalid Zod — `@smoke`
- `e2e/api/auth/password-reset.spec.ts` — request always 200, confirm success/expired/reused — `@regression`

Framework wiring landed as part of this feature:

- `userFactory.create()` — currently throws; wires to `POST /api/register` and
  returns the created user (`e2e/support/factories/user.factory.ts`).
- `loggedInPage` — currently throws; wires to a per-worker cached
  `storageState` via `POST` to Auth.js Credentials, seeds a signed-in `Page`
  (`e2e/support/fixtures.ts`).

## Open questions

- **Reset token TTL — 1 hour by default.** Push back if you want 15 min (safer)
  or 24 h (friendlier). Ties into the "@regression" expiration test.
- **Register: auto-login or bounce to /login?** Proposed auto-login for a
  smoother first impression. Revisit if we ever add mandatory email
  verification.
- **Argon2 params** — start at library defaults; measure Vercel cold-start
  login latency during implementation and tune if > 250 ms.
