# medium-alt

A Medium-alternative writing platform, built as a substrate for practicing:

1. **A production-quality E2E automation framework** built from scratch on top of Playwright.
2. **Agentic PR review** — a custom GitHub Actions pipeline that assembles context for and dispatches Claude to review every PR.

The app is scoped to a RealWorld-plus-claps clone: auth, profiles, article publishing, feed, tags, follow/your-feed, claps, comments. The app is the substrate — the framework and the review pipeline are the point.

## Quick start

Prereqs: **Node 22+, pnpm 11+, Docker Desktop, gh CLI**.

```bash
# One-time setup
cp .env.example .env             # then fill AUTH_SECRET (openssl rand -base64 32)
pnpm install
pnpm playwright:install          # browsers for Playwright
docker compose up -d             # postgres + mailpit
pnpm db:migrate                  # apply migrations

# Dev loop
pnpm dev                         # Next.js dev server → http://localhost:3000
pnpm test:e2e:smoke              # fastest E2E signal
pnpm test:unit                   # Vitest for pure helpers
```

Local services:

| Service   | Port                            | Why                                   |
| --------- | ------------------------------- | ------------------------------------- |
| Next.js   | http://localhost:3000           | The app                               |
| Postgres  | 5432                            | Local DB                              |
| Mailpit   | http://localhost:8025 (UI/API)  | Captures every email the app sends    |

## Repo layout

```
app/                Next.js App Router (pages + Route Handlers as REST API)
components/         React components (shadcn/ui lives under components/ui)
lib/                Shared server-side helpers (db client, auth, mailer, ...)
prisma/             Prisma schema + migrations + seed
e2e/                Playwright framework — see e2e/README.md
emails/             React Email templates
docs/               specs/, architecture.md, workflow.md
.github/workflows/  ci.yml, e2e.yml, review.yml
```

## Docs

- [`docs/architecture.md`](docs/architecture.md) — the full stack decision log.
- [`docs/workflow.md`](docs/workflow.md) — the spec-first + E2E-TDD + review loop.
- [`docs/specs/`](docs/specs/) — one file per feature (canonical intent).
- [`CODING_STANDARDS.md`](CODING_STANDARDS.md) — the rules the review agent enforces.
- [`CLAUDE.md`](CLAUDE.md) — session instructions for Claude in this repo.

## License

Unlicensed / personal.
