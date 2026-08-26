# Per-feature workflow

The loop we run for every feature in the v1 build order. This is the shape that makes the E2E framework, the docs kit, and the agentic review pipeline reinforce each other instead of drifting.

```
spec  ──▶  issue  ──▶  branch  ──▶  E2E tests (red)  ──▶  implement (green)
                                                              │
                                                              ▼
                                        PR  ──▶  CI + agentic review  ──▶  merge
```

## 1. Write the spec

Copy `docs/specs/_template.md` to `docs/specs/<feature>.md`. Fill in:
- **Intent** — one paragraph, what user problem this solves.
- **User stories** — bulleted "as a X I want to Y so that Z".
- **Acceptance criteria** — bulleted verifiable behaviors; these will become E2E test names.
- **Data model delta** — new / changed Prisma models.
- **API surface** — new Route Handlers + method + input/output shape.
- **UI surface** — new pages/components.
- **Non-goals** — explicitly what this feature is NOT doing.

Commit the spec on `main` (or a `docs/` branch) before starting the feature branch. The review agent grounds on the merged version.

## 2. Open the tracking issue

```
gh issue create \
  --title "feat: <feature>" \
  --body "Spec: [docs/specs/<feature>.md](docs/specs/<feature>.md)"
```

Add `Tracking: #<N>` to the top of the spec doc.

## 3. Branch

```
git checkout -b feat/<feature>
```

Feature branches only. Never push to `main`.

## 4. Write E2E tests first (red)

For each acceptance criterion in the spec, add a Playwright test under `e2e/tests/<feature>/` and/or `e2e/api/<feature>/`. Tag with `@smoke` (critical path) or `@regression`.

Run `pnpm test:e2e:smoke` — you expect these to fail. That's the point.

## 5. Implement to green

Ship the smallest change that turns the tests green. Refactor after they're green.

Every commit should keep the repo in a state where `pnpm typecheck` and `pnpm lint` pass. Small commits are fine; broken commits are not.

## 6. Open the PR

```
gh pr create \
  --title "feat(<feature>): <short summary>" \
  --body "$(cat <<'EOF'
Closes #<issue>

Spec: [docs/specs/<feature>.md](docs/specs/<feature>.md)

## Acceptance criteria

- [x] <criterion 1>
- [x] <criterion 2>
EOF
)"
```

## 7. CI + agentic review

On PR open/update:
- `ci.yml` — typecheck, lint, Vitest unit, Playwright API tests against a container.
- `e2e.yml` — waits for Vercel preview, provisions a Neon branch, runs Playwright sharded, uploads traces/videos.
- `review.yml` — assembles a context bundle (diff, linked spec, test results, preview URL, screenshots) and invokes Claude. Review posts as a PR comment.

## 8. Address + merge

Address review feedback. Push updates trigger re-runs of everything. When CI is green and the review is satisfied, squash-merge with a Conventional Commit message.

The tracking issue auto-closes via `Closes #<issue>`.

## Definition of "feature done"

- Spec merged.
- Feature branch merged into `main`.
- E2E tests green in CI (`@smoke` on every PR, full `@regression` nightly).
- Agentic review has left at least one round of feedback that was addressed.
- Vercel preview → prod promotion is clean.
