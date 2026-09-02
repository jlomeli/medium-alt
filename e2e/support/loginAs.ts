import type { Browser, BrowserContext, APIRequestContext } from "@playwright/test";
import { UserFactory, type CreatedUser } from "./factories/user.factory";

/**
 * Create a fresh user and an authenticated `APIRequestContext` for
 * them. Used by tests that need MORE than one signed-in user in the
 * same run — the built-in `loggedInPage` fixture only yields one.
 *
 * Mirrors the CSRF + credentials handshake in `fixtures.ts` so the
 * two setups can't drift. Deliberately does NOT open a `Page` — the
 * common cross-user shape is "user A is the browser subject, user B
 * exists only to produce data via API." Callers that need a real
 * browser session for user B can call `context.newPage()` on the
 * returned `context`.
 *
 * Returns the underlying `BrowserContext` so the test can close it
 * in an `afterEach` if the run is memory-sensitive; Playwright will
 * also tear it down at end-of-test if it's forgotten.
 */
export async function createLoggedInApi(
  browser: Browser,
  baseURL?: string,
): Promise<{ user: CreatedUser; api: APIRequestContext; context: BrowserContext }> {
  const context = await browser.newContext({ baseURL });
  const factory = new UserFactory(context.request);
  const user = await factory.create();

  const csrfRes = await context.request.get("/api/auth/csrf");
  if (!csrfRes.ok()) {
    throw new Error(`csrf fetch failed: ${csrfRes.status()}`);
  }
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  const loginRes = await context.request.post(
    "/api/auth/callback/credentials",
    {
      form: { csrfToken, email: user.email, password: user.password },
      maxRedirects: 0,
    },
  );
  if (loginRes.status() >= 400) {
    throw new Error(
      `credentials login failed: ${loginRes.status()} — ${await loginRes.text()}`,
    );
  }
  const location = loginRes.headers()["location"] ?? "";
  if (loginRes.status() >= 300 && location.includes("error=")) {
    throw new Error(`credentials login rejected: ${location}`);
  }
  const cookies = await context.cookies();
  const hasJwt = cookies.some(
    (c) =>
      c.name === "authjs.session-token" ||
      c.name === "__Secure-authjs.session-token",
  );
  if (!hasJwt) {
    throw new Error("credentials login did not set a session cookie");
  }

  return { user, api: context.request, context };
}
