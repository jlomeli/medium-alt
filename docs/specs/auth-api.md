# Spec: Auth API surface (`/api/login` + `/api/logout` in OpenAPI)

Tracking: #TBD
Status: draft
Owner: jlomeli

## Intent

Close the two documentation gaps a Postman/Bruno user hits after
importing our OpenAPI spec: there's no advertised way to log in, and
`/api/logout` is deliberately hidden. Both are today served by
`/api/auth/[...nextauth]` (Auth.js internal) plus a thin custom logout
handler — good enough for the UI, opaque to integrators.

This slice:

- Adds `POST /api/login` — a first-party JSON endpoint that wraps the
  Credentials sign-in flow. Same request shape as Auth.js's callback,
  same JWT cookie side-effect, but under a stable contract that we own.
- Removes `/api/logout` from the OpenAPI allowlist and gives it a proper
  registration. No behavior change — the endpoint already exists.
- Backfills the missing API-level test coverage: the login flow gets a
  direct-request spec matching what `e2e/api/auth/register.spec.ts` does
  for register.

## User stories

- As a client integrator, I want a documented `POST /api/login` I can
  call with `{ email, password }` and get a session cookie back.
- As the same integrator, I want `/api/logout` visible in the docs so I
  know how to end the session I just created.
- As a code reviewer, I want the same shape/anti-enumeration guarantees
  from `/api/login` that we hold for `/api/auth/callback/credentials` —
  no timing or response-body signal that reveals whether an email is
  registered.

## Acceptance criteria

Each becomes one Playwright test. Grouped by journey.

### `POST /api/login`

- [ ] Valid credentials return `200 { user: { id, email, username } }`
  and set a session cookie (`authjs.session-token` or its `__Secure-`
  variant depending on protocol).
- [ ] The response does not include `passwordHash` or any other private
  field beyond what `/api/register` returns.
- [ ] A follow-up `GET /api/me` with the same request context returns
  the same user — the session is really active.
- [ ] Invalid password returns `401 { error: "invalid-credentials" }`.
- [ ] Unknown email returns the same `401 { error: "invalid-credentials" }`
  — byte-for-byte identical response body.
- [ ] Zod-invalid payload (missing password, malformed email) returns
  `400 { error: { field, code, message? } }` — the same shape
  `/api/register` uses so client wiring is symmetric.
- [ ] Wall-clock timing for wrong-password vs. unknown-email attempts is
  within a small delta (both paths run argon2 — see spec §Anti-enumeration
  below). Not tested via wall-clock in E2E (flaky in CI); enforced by
  the shared `dummyPasswordHash` code path already used by Auth.js
  `authorize()`, plus a code-level assertion that both branches call
  `verifyPassword`.

### `POST /api/logout`

- [ ] Returns 303 with `Location: /` and `Set-Cookie` clearing the
  session cookies (behavior already exists — this test pins the contract).
- [ ] After logout, `GET /api/me` in the same request context returns
  `401`.

### OpenAPI + docs

- [ ] `/api/login` appears in `/api/openapi.json` under `paths` with a
  request schema (Zod `loginSchema`), 200 response schema, 401 response
  schema, and 400 response schema.
- [ ] `/api/logout` appears in `/api/openapi.json` under `paths` with
  no request body and a 303 response.
- [ ] The coverage guard in `e2e/api/openapi/coverage.spec.ts` no
  longer allowlists `/api/logout`.

## Non-goals

- **Rewriting the browser login flow** to POST `/api/login`. Not in this
  slice — see §Client migration below. Keeping `signIn("credentials",
  …)` from `next-auth/react` in the login form; both paths coexist and
  produce the same session cookie because `/api/login` uses the same
  Auth.js `signIn()` internally.
- **Migrating away from Auth.js.** `/api/login` wraps Auth.js's
  `signIn()` — it does not reimplement JWT signing, cookie serialization,
  or CSRF.
- **Rate-limiting.** Same Phase-2 hold as the rest of the auth surface.

## Anti-enumeration

Reuses the guarantees the Credentials `authorize()` callback already
holds:

- Wrong-password and unknown-email must produce identical response
  bodies (same status, same JSON) and equivalent wall-clock time.
- Achieved by delegating to Auth.js `signIn()`, which itself calls the
  `authorize()` in `lib/auth/config.ts` — and that function already runs
  argon2 against the static `DUMMY_PASSWORD_HASH` on cache-misses.

## Data model delta

None.

## API surface

| Method | Path          | Auth  | Input (Zod)   | Output                                                              |
| ------ | ------------- | ----- | ------------- | ------------------------------------------------------------------- |
| POST   | `/api/login`  | No    | `LoginInput`  | `200 { user: { id, email, username } }` + Set-Cookie; `401`; `400` |
| POST   | `/api/logout` | mixed | —             | `303` + Set-Cookie clearing session                                 |

`LoginInput` is the existing `loginSchema` in `lib/validation/auth.ts`
(email + password required). No new Zod work.

Server-side rules for `/api/login`:

- Parse body via `loginSchema`. Zod failure → 400 with `{ field, code,
  message }`, matching `/api/register`.
- Call `signIn("credentials", { email, password, redirect: false })`.
  Auth.js's `authorize()` handles the actual verification (with the
  anti-enumeration `DUMMY_PASSWORD_HASH` fallback) and cookie
  serialization.
- Success → look up the freshly-authenticated user, return `{ user: {
  id, email, username } }` as JSON. Auth.js has already set the cookie
  on the response.
- Failure → 401 with `{ error: "invalid-credentials" }`. Same body for
  wrong-password and unknown-email.

## UI surface

None. Login form continues to use `signIn("credentials", …)` from
`next-auth/react` — no reason to churn it. Both paths call the same
underlying Auth.js primitive; the JWT cookie and downstream behavior are
identical.

## Testing seams

None.

## Client migration

Deferred. Rewriting the login form to POST `/api/login` is symmetric
with how `/register` posts to `/api/register`, and would be a natural
Phase-2 cleanup, but it isn't a functional gap — the current
`signIn()` call already works. Landing that migration alongside a
change to `next-auth/react` (e.g. a version bump) is a better time to
do it.

## E2E test plan

- `e2e/api/auth/login.spec.ts` — the 6 `/api/login` acceptance criteria
  above. `@smoke @api`.
- `e2e/api/auth/logout.spec.ts` — the 2 `/api/logout` acceptance
  criteria. `@smoke @api`.

## Open questions

None — defaults locked in below.
