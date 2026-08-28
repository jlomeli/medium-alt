# Spec: API documentation (OpenAPI + Scalar)

Tracking: #5
Status: draft
Owner: jlomeli

## Intent

Give the existing REST surface (register / login / logout / password reset,
plus everything downstream) a machine-readable contract and an interactive
docs page. Two payoffs:

1. **Docs that can't drift.** The OpenAPI spec is generated from the same
   Zod schemas that already power server-side validation and client-side
   field errors. A route can't change shape without the spec changing with
   it.
2. **Schema-checked responses in E2E API tests.** The Zod schemas that back
   the spec are the exact ones a Playwright API test can `.parse()` a
   response with — no separate contract definition.

## User stories

- As a client integrator, I want an interactive docs page at `/api/docs`
  where I can browse endpoints and fire test requests.
- As a QA engineer, I want a canonical `openapi.json` I can point tooling at.
- As a Route Handler author, I want to declare a route's shape once (Zod
  input/output + a small metadata object) and have that populate both the
  runtime validator and the OpenAPI registry.

## Acceptance criteria

Each becomes one Playwright test.

- [ ] `GET /api/openapi.json` returns 200 with `content-type:
  application/json` and a body whose `openapi` field is `"3.1.0"`.
- [ ] The returned document is valid OpenAPI 3.1 (parsed successfully by
  a JSON-Schema-based validator; no schema errors).
- [ ] Every custom endpoint in `app/api/**` (excluding `/api/test/*`,
  `/api/auth/[...nextauth]`, `/api/logout`, and the spec/docs endpoints
  themselves) appears under `paths` with at least a `summary`, request
  schema, and 2xx response schema.
- [ ] `POST /api/register` in the doc references the same `RegisterInput`
  shape as `lib/validation/auth.ts` — the doc's request schema round-trips
  through `RegisterInput.safeParse(payload)` and passes on the same inputs
  that pass the live endpoint's validation.
- [ ] `GET /api/docs` returns 200 HTML with an accessible page title
  matching the API's `info.title`, reachable via `getByRole('heading',
  { level: 1 })`.
- [ ] Schema-checked-response smoke: the `POST /api/register` E2E test
  parses the response body against `RegisterResponseSchema` and it passes.
- [ ] **Coverage enforcement.** A test scans `app/api/**/route.ts` and fails
  CI if any route lacks either a `registerRoute(...)` entry in
  `lib/openapi/routes.ts` or an explicit allowlist entry (with rationale)
  in `e2e/api/openapi/coverage.spec.ts`. A parallel test fails CI if the
  allowlist references a route that no longer exists on disk. Combined,
  these two make it impossible to ship a new endpoint that silently drops
  out of the spec.

## Non-goals

- Auto-generating typed clients (openapi-typescript, orval, etc.) — Phase 2.
- Contract fuzzing (Schemathesis) — Phase 2.
- Versioning the spec across releases — for v1, `info.version` mirrors
  `package.json`.
- Documenting the `/api/test/*` dev seams — they must not appear.
- Documenting `/api/auth/[...nextauth]` internals — Auth.js owns that
  surface; we document only our own custom endpoints.
- Documenting `/api/logout` — behavior is spec-covered under auth already,
  and the endpoint's contract is "POST → 303, no request body". Trivial
  and not worth Zod'ing.

## Data model delta

None.

## API surface

Two new Route Handlers:

| Method | Path                | Auth | Input | Output                        |
| ------ | ------------------- | ---- | ----- | ----------------------------- |
| GET    | `/api/openapi.json` | No   | —     | OpenAPI 3.1 document (JSON)   |
| GET    | `/api/docs`         | No   | —     | HTML page rendering Scalar    |

## UI surface

- `/api/docs` — Scalar-rendered docs page. Zero custom UI; a mount point
  for Scalar's web component pointed at `/api/openapi.json`.

## Library choice

- **Spec generator: `zod-openapi`** (Sam Chungy). Actively maintained,
  Zod v4 compatible, produces OpenAPI 3.1. Zero runtime cost on hot paths
  — the document is generated once per boot.
- **Renderer: `@scalar/nextjs-api-reference`** (or the CDN script). MIT,
  drop-in.

## Testing seams

None.

## Structure

- `lib/openapi/registry.ts` — module-scoped registry instance.
- `lib/openapi/document.ts` — assembles the final OpenAPI document
  (title, version from `package.json`, `servers` list derived from the
  request's origin at build time).
- `lib/openapi/register-route.ts` — thin helper called once per route at
  module scope: `registerRoute({ method, path, request, responses })`.
- Each Route Handler imports `registerRoute` and calls it once at module
  scope alongside its existing exports.
- `app/api/openapi.json/route.ts` — `GET` returns the assembled document.
- `app/api/docs/page.tsx` — server component rendering Scalar.

Registration lives inside each `route.ts` (Open-question default), so
that a Route Handler's contract and its OpenAPI declaration are always
diff-visible together.

## E2E test plan

- `e2e/api/openapi/spec.spec.ts` — validates the document, checks endpoint
  coverage, exercises the `RegisterInput` round-trip. `@smoke @api`.
- `e2e/tests/api-docs/scalar.spec.ts` — `/api/docs` renders, page title
  is present. `@smoke`.
- Existing `e2e/api/auth/register.spec.ts` gains one `.parse()` line to
  demonstrate the schema-check pattern; other API specs can adopt it as
  needed.

## Open questions

None — the previous defaults (Scalar renderer, dynamic origin for
`servers`, `info.version` mirrors `package.json`, registration lives in
each `route.ts`) are locked in.
