import { test as base, expect, type Page, type APIRequestContext } from "@playwright/test";
import { UserFactory, type CreatedUser } from "./factories/user.factory";
import { MailpitClient } from "./clients/mailpit.client";

/**
 * The medium-alt Playwright fixture layer.
 *
 * This is the seam every test extends off. Adding a cross-cutting concern
 * (auth, seeded DB, API client, mail inbox) means adding a fixture here, NOT
 * repeating setup inside a test file.
 *
 * Fixture doctrine — see docs/CODING_STANDARDS.md §Testing:
 *   - Never fill the login form in a test that isn't testing the login form.
 *     Use `loggedInPage`.
 *   - Never create a user by clicking through /register. Use `userFactory`.
 *   - Never read a real inbox. Use `mailpit`.
 */

type Fixtures = {
  api: APIRequestContext;
  userFactory: UserFactory;
  testUser: CreatedUser;
  loggedInPage: Page;
  mailpit: MailpitClient;
};

export const test = base.extend<Fixtures>({
  api: async ({ request }, use) => {
    await use(request);
  },

  userFactory: async ({ request }, use) => {
    await use(new UserFactory(request));
  },

  testUser: async ({ userFactory }, use) => {
    const user = await userFactory.create();
    await use(user);
  },

  loggedInPage: async ({ page: _page, testUser: _testUser }, _use) => {
    // TODO(auth-feature): once /api/auth/login exists, sign in via API and
    // seed the storageState. Until then this fixture fails loudly on first use
    // so tests written before auth exists can't silently pretend to be logged
    // in. See docs/specs/auth.md.
    throw new Error(
      "loggedInPage fixture not yet wired — the auth feature has not landed. " +
        "See docs/specs/auth.md.",
    );
  },

  mailpit: async ({}, use) => {
    await use(new MailpitClient(process.env.E2E_MAILPIT_URL ?? "http://localhost:8025"));
  },
});

export { expect };
