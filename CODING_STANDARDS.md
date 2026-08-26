# Coding standards

These are the rules the agentic PR reviewer grades against. If code lands that violates one of these, the review should flag it. If you disagree with a rule, open a PR against this file — don't ignore it silently.

## 1. TypeScript

- **Strict mode is on.** No `any`. If you truly need an escape, use `unknown` and narrow.
- Prefer `type` for unions, `interface` for object shapes with declaration merging potential.
- Types shared between the app and E2E live under `lib/types/`.

## 2. Next.js App Router

- **Server components by default.** Only mark `"use client"` when you actually need state, effects, or browser APIs. Push client boundaries to the leaves.
- Route Handlers (`app/api/**/route.ts`) are the app's REST API — used by both the browser and the E2E framework's factories. Validate every input with **Zod**. Return typed JSON, never raw `NextResponse.json(unknownShape)`.
- Server actions are allowed for form submissions; they must still validate with Zod.

## 3. Data

- **Prisma is the only path to the database.** No raw SQL outside a migration.
- Every mutation goes through a function in `lib/db/` (or `app/api/**/route.ts`), never inline in a component.
- Foreign-key deletes cascade unless there's a documented reason not to.

## 4. Auth

- Auth.js session is the only source of truth for "who is the current user."
- Server code reads it via `auth()` from `lib/auth.ts`.
- Never trust a client-sent `userId` — always resolve from the session.

## 5. UI (Tailwind + shadcn/ui)

- Semantic HTML first. `<button>` for actions, `<a>` for navigation, `<h1>`–`<h6>` in outline order.
- **Accessible names are non-negotiable.** Every interactive element must be findable by `getByRole('...', { name: '...' })`. Icons that carry action need `aria-label`.
- shadcn/ui components live under `components/ui/`. Don't hand-edit them without a reason; if you need a variant, extend, don't fork.

## 6. Validation

- All external input (route handler bodies, server action inputs, query params, form data) is validated with **Zod** at the boundary.
- Zod schemas live next to the route or action that uses them; if reused, promote to `lib/schemas/`.

## 7. Errors

- Route handlers return `{ error: string, code: string, details?: ... }` on failure with the correct HTTP status.
- Never leak Prisma errors to the client. Catch, log, return a safe shape.

## 8. Testing

### 8.1 What lives where

- **Playwright UI tests** for user journeys — `e2e/tests/<feature>/*.spec.ts`.
- **Playwright API tests** for HTTP contract — `e2e/api/<feature>/*.spec.ts`.
- **Vitest** for pure helpers and Zod schemas — `lib/**/*.test.ts`.
- **No React Testing Library.** Component behavior is validated at the browser level via Playwright.

### 8.2 Locator policy

Priority: `getByRole` → `getByLabel` → `getByPlaceholder` → `getByText` → `getByTestId` (escape hatch) → CSS/XPath (banned).

A `data-testid` is only justified when the element genuinely has no accessible affordance (e.g., a purely decorative wrapper you must locate). Its use requires a code comment explaining why.

### 8.3 Fixtures + factories

- Any cross-cutting test setup goes in `e2e/support/fixtures.ts` — not inline in a test.
- Users are created via `UserFactory`, not by clicking through `/register`.
- Sessions are established via the `loggedInPage` fixture, not by filling the login form. Tests in `e2e/tests/auth/` are the only exception.
- Every test must be independently runnable — no ordering dependencies.

### 8.4 Tagging

Every UI test title carries at least one tag: `@smoke` or `@regression`. Optional supplements: `@slow`, `@visual`, `@flaky` (`@flaky` tests are quarantined and blocked from merging until fixed).

### 8.5 Assertions

- Prefer web-first assertions (`await expect(locator).toBeVisible()`), not `expect(await locator.isVisible()).toBe(true)`.
- Visual regression via `toHaveScreenshot()` — baselines checked into the repo under `e2e/__screenshots__/`.
- Never `page.waitForTimeout()` in committed code. If you need it, you have a race condition to fix.

## 9. Commits + PRs

- **Conventional commits**: `feat(auth): ...`, `fix(articles): ...`, `test(feed): ...`, `docs(specs): ...`, `chore: ...`.
- Every PR targeting a feature references its spec: `Closes #<issue>` in the PR body, `docs/specs/<feature>.md` linked at the top.
- PRs are single-purpose — one feature slice or one refactor per PR.
- CI must be green before merge.

## 10. Secrets

- Never commit a real secret. `.env.example` documents required keys; local `.env` is gitignored.
- Production secrets live in Vercel + GitHub Actions secrets, not in code.

---

If a review comment cites `CODING_STANDARDS.md §X`, this is the reference.
