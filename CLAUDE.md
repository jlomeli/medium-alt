# Claude session instructions for medium-alt

This repo is a Medium-clone built as a substrate for practicing an E2E automation framework and an agentic PR review pipeline. Read [`docs/architecture.md`](docs/architecture.md) and [`docs/workflow.md`](docs/workflow.md) once at session start.

## Ground rules

1. **Read the spec first.** Every feature has a `docs/specs/<feature>.md`. Do not implement or modify a feature without reading its spec. If a spec is missing, write it first (see `docs/specs/_template.md`) and confirm with the user before coding.
2. **Follow the per-feature workflow.** Spec → E2E test (failing) → implement to green → PR → agentic review → merge. See [`docs/workflow.md`](docs/workflow.md).
3. **Honor `CODING_STANDARDS.md`.** The review agent grades PRs against it; don't ship code that violates it and expect the review to be quiet.
4. **Run `pnpm typecheck` and `pnpm lint` before proposing a commit.** Both must be clean.
5. **When you add or change a Prisma model,** run `pnpm db:migrate` and commit the generated migration.
6. **When you add a new user-facing route or action,** it needs at least one E2E test tagged `@smoke` or `@regression`.

## Locator policy (repeated because it matters)

Playwright locators, in priority order:
1. `getByRole('...', { name: '...' })`
2. `getByLabel('...')`
3. `getByPlaceholder('...')`
4. `getByText('...')`
5. `getByTestId('...')` — **escape hatch**, requires a code comment explaining why no accessible affordance was possible.
6. CSS/XPath — **banned** outside genuine emergencies (add a `// TODO: fix locator` and the reason).

If `getByRole` doesn't find your element, the element probably isn't accessible. That's a real bug — fix the markup, don't reach for `data-testid`.

## Common tasks

| Task                           | Command                        |
| ------------------------------ | ------------------------------ |
| Boot services                  | `docker compose up -d`          |
| Run app                        | `pnpm dev`                      |
| Typecheck                      | `pnpm typecheck`                |
| Lint                           | `pnpm lint`                     |
| Unit tests                     | `pnpm test:unit`                |
| E2E — smoke only               | `pnpm test:e2e:smoke`           |
| E2E — full UI on chromium      | `pnpm test:e2e`                 |
| E2E — Playwright UI mode       | `pnpm test:e2e:ui`              |
| API tests only                 | `pnpm test:api`                 |
| Reset DB (destroys local data) | `pnpm db:reset`                 |
| New migration                  | `pnpm db:migrate --name <name>` |

## Absolute don'ts

- Don't push directly to `main`. Feature branch + PR, always.
- Don't add a `data-testid` to make a test pass without first trying `getByRole`.
- Don't skip writing the spec because "it's obvious."
- Don't seed test data through the UI when a factory exists.
- Don't fill a login form outside `e2e/tests/auth/`.
