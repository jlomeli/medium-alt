import { test, expect } from "@e2e/support/fixtures";
import { createLoggedInApi } from "@e2e/support/loginAs";

/**
 * Acceptance criteria from docs/specs/follow.md → § Your Feed tab on
 * home.
 */

test.describe("@smoke your feed tab on /", () => {
  test("tabs render only when the viewer is signed in", async ({
    page,
    loggedInPage,
  }) => {
    // Anonymous: no Your Feed tab.
    await page.goto("/");
    await expect(
      page.getByRole("link", { name: "Your Feed" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("link", { name: "Global" }),
    ).toHaveCount(0);

    // Signed-in: both tabs present.
    await loggedInPage.goto("/");
    await expect(
      loggedInPage.getByRole("link", { name: "Your Feed" }),
    ).toBeVisible();
    await expect(
      loggedInPage.getByRole("link", { name: "Global" }),
    ).toBeVisible();
  });

  test("your feed shows articles from followed authors and hides everyone else's", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
    followFactory,
    userFactory,
  }) => {
    // Target author lives in a secondary context so they can create
    // articles under their own session.
    const targetSession = await createLoggedInApi(browser, baseURL);
    const targetArticle = await articleFactory.create(targetSession.api, {
      published: true,
      title: `Followed-author article ${Date.now()}`,
    });

    // A second, unfollowed author whose article MUST NOT appear.
    const otherSession = await createLoggedInApi(browser, baseURL);
    const otherArticle = await articleFactory.create(otherSession.api, {
      published: true,
      title: `Stranger article ${Date.now()}`,
    });

    // Silence the "unused" lint — we don't need the created user for
    // any follow-up, only the article they published.
    void userFactory;

    // Follow the target as the primary viewer.
    await followFactory.create(loggedInPage.request, targetSession.user.username);

    await loggedInPage.goto("/?feed=me");
    // Followed author's article shows up.
    await expect(
      loggedInPage.getByRole("link", { name: targetArticle.title }),
    ).toBeVisible();
    // Stranger's article does NOT.
    await expect(
      loggedInPage.getByRole("link", { name: otherArticle.title }),
    ).toHaveCount(0);

    await targetSession.context.close();
    await otherSession.context.close();
  });

  test("signed-in viewer following nobody sees the empty state + CTAs", async ({
    loggedInPage,
  }) => {
    // A brand-new `loggedInPage` user has zero follows by construction.
    await loggedInPage.goto("/?feed=me");
    await expect(
      loggedInPage.getByRole("heading", {
        name: /aren't following anyone/i,
      }),
    ).toBeVisible();
    // Two navigation CTAs, both real links (not buttons).
    await expect(
      loggedInPage.getByRole("link", { name: /browse the global feed/i }),
    ).toBeVisible();
    await expect(
      loggedInPage.getByRole("link", { name: /explore popular tags/i }),
    ).toBeVisible();
  });

  test("anonymous visit to /?feed=me redirects to /login with callbackUrl", async ({
    page,
  }) => {
    const response = await page.goto("/?feed=me");
    // Server-side redirect ends up on /login; the callbackUrl is the
    // URL-encoded `/?feed=me` string.
    await expect(page).toHaveURL(/\/login/);
    expect(page.url()).toContain(
      `callbackUrl=${encodeURIComponent("/?feed=me")}`,
    );
    // The final response is /login itself (200), not a 3xx — the
    // browser has already followed.
    expect(response?.status()).toBe(200);
  });
});
