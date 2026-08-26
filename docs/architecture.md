# Architecture

Every choice here was argued through explicitly during the initial grilling session. This doc is the distilled decision log — the reference both humans and the review agent ground against.

## Scope (v1)

RealWorld + claps: auth (email+password), profile, article CRUD with basic rich text + images, reading page, latest-articles feed, tags + filter, follow/unfollow, "your feed", claps, comments. ~10 screens, ~6 resource types.

**Out of scope for v1:** bookmarks, highlights, search, publications, notifications, paywall, newsletter, stats, social auth, Sentry, analytics, rate limiting, feature flags, i18n, real-time.

## Stack decisions

| Layer              | Choice                                            | Why                                                                                                                                            |
| ------------------ | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Language           | TypeScript end-to-end                             | One language across app + tests; Playwright is TS-first.                                                                                       |
| App shape          | Next.js App Router monolith                       | One repo, one deploy; Route Handlers give a REST API for both users and the E2E framework's factories.                                         |
| DB                 | PostgreSQL — Docker locally, Neon in prod         | Relational data model; Neon's DB branching enables per-run isolation for E2E without a 10-minute setup cost.                                    |
| ORM                | Prisma (+ Neon adapter)                           | Best docs, migration ergonomics, generated types; adapter solves cold starts on Neon serverless.                                              |
| Auth               | Auth.js v5 + Credentials + Prisma adapter         | Industry-standard for Next.js; you build your own login/register UI (stays in E2E scope); session/CSRF handled.                                |
| UI                 | Tailwind + shadcn/ui                              | Radix under the hood → accessible markup → `getByRole` locators work without `data-testid` sprinkles.                                          |
| Editor             | Tiptap with custom toolbar                        | Realistic contenteditable surface for the framework to solve; TS-first; largest React tutorial base.                                           |
| Uploads            | UploadThing                                       | Fastest TS-native path for Next.js; `page.setInputFiles()` handles automation.                                                                |
| Email              | Resend prod / Mailpit dev                         | Mailpit's HTTP API is designed for E2E capture of password-reset flows.                                                                       |
| Hosting            | Vercel                                            | Preview env per PR — directly enables agentic review against live URLs.                                                                       |
| Repo               | Single-package Next.js                            | Monorepo tax not earned at scope-A + solo dev.                                                                                                 |

## E2E framework decisions

| Concern          | Choice                                                    | Why                                                                                                        |
| ---------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Runner           | Playwright                                                | Trace viewer, auto-waiting, fixtures, multi-browser, current-dominant.                                     |
| Architecture     | Hybrid POM + Component Objects + typed fixtures           | Résumé-legible POM vocabulary + a real architectural upgrade.                                              |
| Test data        | Factories → API seeding primary → direct-Prisma fast path | Modeled on fishery / factory_bot; the senior-SDET-shaped part of the framework.                            |
| Auth reuse       | Per-worker `storageState` via API login → `loggedInPage`  | Canonical Playwright pattern; scales; exercises the real login code path.                                  |
| Locators         | Role/label/text first, `data-testid` escape hatch         | Doubles as accessibility forcing function.                                                                 |
| Organization     | Feature folders + `@smoke`/`@regression` tags             | No BDD — for solo engineer-authored suites it costs more than it delivers.                                 |
| Isolation        | Neon DB branch per run in CI, docker Postgres locally     | The modern answer to "how do E2E tests stay green as data changes."                                        |
| Reporting        | Playwright HTML + PR summary comment                      | Native + free; layered visual dashboard (Argos) can land in Phase 2.                                       |
| Visual regression| `toHaveScreenshot()` with baselines in repo               | Zero-vendor; baselines diffable in review; Chromatic/Argos as Phase 2 upgrade path.                        |
| API testing      | Playwright `request` fixture, `e2e/api/` folder           | Same runner, same reporter, same fixtures — clean layered pyramid.                                         |
| App-side tests   | Vitest for pure helpers + Zod only, no RTL                | Playwright covers component behavior; RTL would duplicate.                                                 |

## Docs + review pipeline

| Concern           | Choice                                                                    |
| ----------------- | ------------------------------------------------------------------------- |
| Specs             | Canonical in `docs/specs/<feature>.md`; GH Issues are thin tracking cards |
| Standards         | `CODING_STANDARDS.md` — the rules the review grades against               |
| Session prompt    | `CLAUDE.md` — instructions for any Claude session in the repo             |
| Review pipeline   | Custom GH Actions → Claude with curated context bundle → PR comment       |
| Review evolution  | Start single-agent; evolve to multi-agent (security / test-coverage / ui-quality / spec-adherence) once the single-agent prompt is tuned |

## Per-feature workflow

1. Write `docs/specs/<feature>.md`.
2. Open a GitHub Issue linking the spec; add `Tracking: #N` to the spec header.
3. Branch: `git checkout -b feat/<feature>`.
4. Write the E2E acceptance tests **first** — they fail.
5. Implement to green.
6. Open PR, reference issue + spec.
7. CI runs typecheck / lint / unit / api / e2e-smoke. Agentic review posts feedback.
8. Address; merge.

## Build order (v1)

1. **Infra + docs bootstrap** ← this doc lands here
2. Auth — register, login, logout, password reset
3. Profile — view/edit
4. Articles CRUD — Tiptap, drafts vs published, images
5. Tags + feed — list, filter, pagination
6. Follow + your-feed
7. Claps — optimistic UI
8. Comments

**v1 done** = all 8 slices merged, E2E green in CI, agentic review has landed feedback on ≥5 PRs.

**Phase 2** = multi-agent review evolution, visual baselines, flakiness dashboards, framework refactoring.
