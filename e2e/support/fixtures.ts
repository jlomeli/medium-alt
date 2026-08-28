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

  loggedInPage: async ({ browser, baseURL }, use) => {
    // The framework rule (docs/CODING_STANDARDS.md §Testing) is: no test
    // outside e2e/tests/auth/ may fill the /login form. This fixture wires
    // the session via the Auth.js Credentials callback — no browser
    // navigation to /login, no locators on password fields.
    const context = await browser.newContext({ baseURL });
    const factory = new UserFactory(context.request);
    const user = await factory.create();

    // CSRF handshake: Auth.js requires a matching csrfToken in both the
    // cookie jar and the POST body. The GET populates the cookie; the POST
    // echoes the value back.
    const csrfRes = await context.request.get("/api/auth/csrf");
    if (!csrfRes.ok()) {
      throw new Error(`csrf fetch failed: ${csrfRes.status()}`);
    }
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

    const loginRes = await context.request.post("/api/auth/callback/credentials", {
      form: {
        csrfToken,
        email: user.email,
        password: user.password,
        // Suppresses the 302 redirect Auth.js would normally issue so we get
        // a JSON response and can assert the status.
        json: "true",
      },
    });
    if (!loginRes.ok()) {
      throw new Error(
        `credentials login failed: ${loginRes.status()} — ${await loginRes.text()}`,
      );
    }

    const page = await context.newPage();
    await use(page);

    await context.close();
  },

  mailpit: async ({}, use) => {
    await use(new MailpitClient(process.env.E2E_MAILPIT_URL ?? "http://localhost:8025"));
  },
});

export { expect };
