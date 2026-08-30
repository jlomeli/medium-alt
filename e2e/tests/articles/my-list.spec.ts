import { test, expect } from "@e2e/support/fixtures";
import { MyArticlesPage } from "@e2e/support/pom/my-articles.page";

/** Acceptance criteria from docs/specs/articles-crud.md → List. */

test.describe("@smoke my articles", () => {
  test("shows own articles with Draft / Published labels", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const draft = await articleFactory.create(loggedInPage.request, { published: false });
    const published = await articleFactory.create(loggedInPage.request, { published: true });

    const list = new MyArticlesPage(loggedInPage);
    await list.goto();

    await expect(list.heading).toBeVisible();
    await expect(list.rowFor(draft.title)).toContainText("Draft");
    await expect(list.rowFor(published.title)).toContainText("Published");
  });

  test("another user's articles never appear", async ({
    loggedInPage,
    articleFactory,
    userFactory,
    page,
  }) => {
    // Owner creates an article via a throwaway logged-in context.
    const stranger = await userFactory.create();
    const login = await page.request.post("/api/login", {
      data: { email: stranger.email, password: stranger.password },
    });
    expect(login.status()).toBe(200);
    const strangersArticle = await articleFactory.create(page.request, { published: true });
    await page.request.post("/api/logout");

    // Now the primary loggedInPage user visits /me/articles — the
    // stranger's title must NOT appear.
    const list = new MyArticlesPage(loggedInPage);
    await list.goto();
    await expect(loggedInPage.getByText(strangersArticle.title)).toHaveCount(0);
  });

  test("signed-out visitor is redirected to /login with callbackUrl", async ({ page }) => {
    await page.goto("/me/articles");
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fme%2Farticles/);
  });
});
