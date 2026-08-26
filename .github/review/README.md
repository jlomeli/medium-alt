# Agentic review pipeline

Skeleton for the from-scratch PR review agent.

## Layout

```
.github/review/
├── build-context.sh          # Assembles the context bundle from the PR
├── prompts/
│   └── single-reviewer.md    # System prompt for the single-agent reviewer
└── README.md
```

## How it runs

`.github/workflows/review.yml` fires on PR open/update. It:

1. Runs `build-context.sh` to produce a markdown context bundle (PR body, linked spec, `CODING_STANDARDS.md`, diff, changed-files list, preview URL).
2. POSTs to the Anthropic Messages API with the bundle as the user turn and `prompts/single-reviewer.md` as the system prompt.
3. Posts the response as a PR comment via `gh pr comment`.

## What to iterate on

The prompt and the context bundle are the whole practice. Tune them by:

- Watching what the reviewer misses on early PRs → add that context source to `build-context.sh` (e.g., Playwright test result summary, failing screenshots, related file contents).
- Watching what the reviewer over-flags → tighten the prompt.
- When single-reviewer feels saturated, split into multi-agent per [`docs/architecture.md`](../../docs/architecture.md#docs--review-pipeline). Each agent gets its own file in `prompts/` and its own step in `review.yml`.

## Secrets needed

- `ANTHROPIC_API_KEY` — set with `gh secret set ANTHROPIC_API_KEY`. The workflow silently no-ops if unset (so PRs still merge before you've configured it).
