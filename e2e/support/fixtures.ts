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

  loggedInPage: async ({ browser, request }, use) => {
    // Fresh user + fresh browser context per test. Per-worker `storageState`
    // caching is a Phase-2 optimization; keeping the shape simple here so the
    // auth surface stays honest during the initial impl.
    const factory = new UserFactory(request);
    const user = await factory.create();

    const context = await browser.newContext();
    const page = await context.newPage();

    // Sign in via Auth.js Credentials by driving the /login form once. Slower
    // than a direct CSRF-token POST, but portable across Auth.js version bumps
    // and hermetic: no shared secrets, no direct DB writes.
    await page.goto("/login");
    await page.getByLabel("Email").fill(user.email);
    await page.getByLabel("Password", { exact: true }).fill(user.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("/");

    await use(page);

    await context.close();
  },

  mailpit: async ({}, use) => {
    await use(new MailpitClient(process.env.E2E_MAILPIT_URL ?? "http://localhost:8025"));
  },
});

export { expect };
