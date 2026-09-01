# How to: seed the local database

One command, well-known credentials, no manual setup. Spec:
[`docs/specs/dev-seed.md`](../specs/dev-seed.md).

## Commands

| Command           | What it does                                                         |
| ----------------- | -------------------------------------------------------------------- |
| `pnpm db:seed`    | Runs the baseline scenario. Idempotent — safe to re-run.             |
| `pnpm db:reset`   | Drops the DB, re-applies migrations, then auto-runs `pnpm db:seed`.  |

The seed refuses to run with `NODE_ENV=production`.

## Baseline credentials

Two users, five published articles, and one draft. Documented once
here so you don't have to fish through the seed file.

| Email                     | Username | Password       | Name       |
| ------------------------- | -------- | -------------- | ---------- |
| `alice@medium-alt.test`   | `alice`  | `Password123!` | Alice Ng   |
| `bob@medium-alt.test`     | `bob`    | `Password123!` | Bob Reyes  |

Alice has three published articles + one draft; Bob has two published
articles. See `prisma/seeds/baseline.ts` for the exact titles and
slugs.

**Tags** (slice 5): the seeded articles carry `writing`, `intro`,
`editor`, and `reading`, spread across authors so a fresh
`pnpm db:seed` lands on a `/` page with populated feed cards, tag
chips, and a non-empty popular-tags sidebar. See
`prisma/seeds/baseline.ts` § `BASELINE_TAGS` for the exact
distribution.

## Rules

- **Don't use seed data in automated tests.** Tests build their own
  state via `e2e/support/factories/`. If a test starts depending on
  a seeded row, a future seed change silently breaks the suite —
  the worst kind of flake. This is a hard rule from
  [`docs/specs/dev-seed.md`](../specs/dev-seed.md) § Non-goals.
- **Adding new state to the app?** For now, no obligation to extend
  the seed. A formal rule + spec-template prompt + PR-template
  checkbox are all deferred (see the spec's § Deferred). If your
  feature's manual-testing story would benefit from baseline
  content, extend `prisma/seeds/baseline.ts` — but it's a nice-to-
  have, not a gate.
- **Extending baseline?** Keep it small and boring. Baseline is
  "what the app looks like on a normal Tuesday." Weird states
  (pagination stress, unicode edge cases, huge cover images) belong
  in their own scenario when the scenario dispatcher lands — see the
  spec's § Deferred.
