# Spec: dev-seed

Tracking: (none — internal tooling)
Status: draft
Owner: jlomeli

## Intent

Give developers a one-command way to populate a local database with a
canonical, well-known set of users and articles for manual testing,
screenshots, and demoing PRs. Today the `prisma/seed.ts` script is a
stub and every manual pass starts from an empty DB — register, log in,
author, repeat. That friction only grows as features land, and it makes
manual sanity-checks and PR demos disproportionately expensive.

This is dev-only tooling. Automated tests already have factories under
`e2e/support/factories/` and MUST NOT depend on seed data.

## User stories

- As a developer, I want to run `pnpm db:seed` once and have a
  realistic populated app so I can click through as a real-looking
  user without any setup.
- As a developer, I want stable, well-known credentials (`alice@…`,
  `bob@…`) so I can log in without checking notes.
- As a reviewer (human or agentic), I want to reproduce the same
  local state on any checkout so PR demos and screenshots are
  comparable.
- As a developer, I want re-running the seed on a working dev DB to
  be a no-op, not a data-loss event.

## Acceptance criteria

Verified by `pnpm db:reset && pnpm db:seed` locally and by the new CI
step (see §CI wiring). No Playwright coverage — this is dev tooling,
not a shipped feature.

- [ ] `pnpm db:seed` on an empty DB creates the baseline users and
      articles and exits 0.
- [ ] `pnpm db:seed` a second time on the same DB is a no-op (upserts
      by natural key; row counts unchanged).
- [ ] Seeded users can log in through the app with their documented
      passwords.
- [ ] Seeded articles render on `/articles/[slug]` and appear on the
      author's `/profiles/[username]`.
- [ ] Running the seed with `NODE_ENV=production` throws and does not
      touch the database.
- [ ] `docs/how-to/seed.md` lists the well-known credentials.
- [ ] The CI `quality` job runs the seed after migrations and fails
      the build if the seed script throws.

## Non-goals

- **Not for automated tests.** Tests use factories in
  `e2e/support/factories/`. No test may assume any seeded row exists.
- **Not destructive.** The seed does not `deleteMany`. Destruction is
  the job of `pnpm db:reset`, which then triggers this seed via the
  `prisma.seed` hook already registered in `package.json`.
- **Not a scenario framework (yet).** One baseline scenario, one
  file, one command. Multiple named scenarios (`pagination`,
  `edge-cases`, `all`) are deferred — see §Deferred.
- **Not run in production.** Guarded by a `NODE_ENV` check at the top
  of the dispatcher.
- **No new API or UI surface.** Uses existing Prisma models and the
  existing `hashPassword` primitive.

## Data model delta

None. The seed writes to existing models: `User`, `Article`.

## API surface

None.

## UI surface

None. Side-effect: the seeded content is browsable through existing
routes (`/`, `/articles/[slug]`, `/profiles/[username]`, `/login`).

## Baseline contents

Two users, five published articles, one draft. Concrete values below;
tune during implementation if a specific field is awkward.

| Email                     | Username | Password       | Name       |
| ------------------------- | -------- | -------------- | ---------- |
| `alice@medium-alt.test`   | `alice`  | `Password123!` | Alice Ng   |
| `bob@medium-alt.test`     | `bob`    | `Password123!` | Bob Reyes  |

Articles (all idempotent by `slug`):

- Alice: three published articles with subtitles, one draft (no
  `publishedAt`).
- Bob: two published articles, one with a cover image.

Bodies are minimal Tiptap ProseMirror JSON (a heading + a paragraph
each) — enough to render, not enough to be a maintenance burden.

## Implementation

- `prisma/seeds/baseline.ts` — exports `async function seedBaseline(db)`.
  Uses `Prisma.UserCreateInput` / `Prisma.ArticleCreateInput` types so
  a required-field change breaks `pnpm typecheck`. Hashes passwords via
  `lib/auth/password.ts::hashPassword`. Validates article bodies through
  the existing Zod schema so a tightened validator breaks the seed
  immediately.
- `prisma/seed.ts` — dispatcher. Guards on `NODE_ENV === "production"`
  and calls `seedBaseline`. Logs a one-line summary of what it did.
- Idempotency: `upsert` keyed on `email` for users and `slug` for
  articles. Re-running is a no-op.

## CI wiring

Add one step to `.github/workflows/ci.yml` in the `quality` job, right
after "Prisma generate + migrate":

```yaml
- name: Seed (drift check)
  run: pnpm db:seed
```

If any scenario ever grows a field mismatch, FK violation, or
validator rejection, CI turns red on the PR that caused it. This is
the whole drift-prevention story for now.

## Documentation

`docs/how-to/seed.md` — one page:
- The two commands (`pnpm db:seed`, `pnpm db:reset`).
- The well-known credentials table.
- The non-goals reminder ("don't rely on seed data in tests").

## Deferred

Explicitly scoped out of this slice; revisit when we feel the pain.

- **Scenario dispatcher.** `pnpm db:seed <name>` with named
  scenarios (`baseline`, `pagination`, `edge-cases`, `all`) each in
  its own file under `prisma/seeds/`. Build the first alt scenario
  the first time you actually want one — don't preemptively design
  the framework.
- **Spec-template `Seed impact` section.** Add a three-line block to
  `docs/specs/_template.md` prompting authors to declare whether
  their feature extends `baseline`, adds a scenario, or needs no
  seed. Add this the first time a PR merges without seed updates and
  the omission causes real confusion.
- **CLAUDE.md rule.** A ground rule: "If your feature introduces
  persistent user-facing state, extend `baseline` or add a
  `prisma/seeds/<feature>.ts` scenario. If not, note it in the
  spec's Seed impact section." Pair with the template change above.
- **PR-template checkbox.** "Seed updated (or N/A)." Only meaningful
  once the template + CLAUDE.md rule are in place.
- **Snapshot testing on seed output.** Dump row counts to a fixture,
  diff in review. Real value, high noise; revisit only if seed drift
  becomes a recurring source of pain.

Trigger to revisit: (a) a PR merges that adds visible state without
extending the seed and the omission is noticed only after merge, or
(b) we need a second scenario for a specific edge case.

## Open questions

None blocking. Passwords, exact article titles, and body content are
implementation choices left to the author.
