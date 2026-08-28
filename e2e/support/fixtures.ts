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

    // maxRedirects: 0 so we can inspect the immediate response. Auth.js emits
    // a 302 on both success (Location = callbackUrl / origin) and failure
    // (Location contains `?error=`). Following blindly can hop the request to
    // a different origin — see the trustHost comment in lib/auth/config.ts.
    const loginRes = await context.request.post("/api/auth/callback/credentials", {
      form: {
        csrfToken,
        email: user.email,
        password: user.password,
      },
      maxRedirects: 0,
    });
    // Any 4xx/5xx is infrastructural (endpoint missing, CSRF cookie not
    // applied, etc.); surface the body so it's diagnosable.
    if (loginRes.status() >= 400) {
      throw new Error(
        `credentials login failed: ${loginRes.status()} — ${await loginRes.text()}`,
      );
    }
    // A 3xx with `error=` in the Location means authorize() rejected. Other
    // 3xx codes are normal successful redirects to the callbackUrl.
    const location = loginRes.headers()["location"] ?? "";
    if (loginRes.status() >= 300 && location.includes("error=")) {
      throw new Error(`credentials login rejected: redirect location=${location}`);
    }
    // Auth.js can respond 200 with { url: "/error?..." } when the credentials
    // authorize() returns null — the status alone isn't a success signal. The
    // authoritative check is that the JWT session cookie now exists in the
    // context jar. Its name depends on protocol (Vercel preview is HTTPS →
    // __Secure- prefix).
    const cookies = await context.cookies();
    const hasJwt = cookies.some(
      (c) => c.name === "authjs.session-token" || c.name === "__Secure-authjs.session-token",
    );
    if (!hasJwt) {
      const body = await loginRes.text();
      throw new Error(
        `credentials login did not set a session cookie — response body: ${body}`,
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
