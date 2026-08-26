# E2E framework

This is the from-scratch E2E automation framework for medium-alt. It exists to
practice building an SDET-quality suite; the app is the substrate.

## Layout

```
e2e/
├── api/                  # API-only tests (Playwright request fixture)
│   └── smoke/
├── tests/                # UI tests (browser)
│   ├── smoke/            # tagged @smoke — runs on every PR (target <2 min)
│   ├── auth/             # (added with auth feature)
│   ├── profile/
│   ├── articles/
│   ├── feed/
│   ├── follow/
│   ├── claps/
│   └── comments/
└── support/
    ├── fixtures.ts       # the fixture seam — extend base test here
    ├── factories/        # UserFactory, ArticleFactory, ...
    ├── clients/          # MailpitClient, ...
    └── pom/              # Page Objects + Component Objects
```

## Commands

```
pnpm test:e2e:smoke        # @smoke tests, chromium, fastest signal
pnpm test:e2e              # full UI suite, chromium
pnpm test:e2e:all          # full UI suite, all browsers
pnpm test:e2e:ui           # Playwright UI mode (interactive)
pnpm test:api              # api-only tests
```

## Conventions

See [`../CODING_STANDARDS.md`](../CODING_STANDARDS.md) §Testing for the full
policy. Highlights:

- Locator priority: `getByRole` → `getByLabel` → `getByText` → `getByTestId` (escape hatch, requires a comment) → CSS/XPath (banned outside emergencies).
- Never fill a login form in a test that isn't about login — use `loggedInPage`.
- Never create a user through the UI — use `UserFactory`.
- Tag every UI test with at least `@smoke` or `@regression`.
