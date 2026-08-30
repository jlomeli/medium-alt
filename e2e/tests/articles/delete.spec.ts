import { test, expect } from "@e2e/support/fixtures";
import { ArticleFormPage } from "@e2e/support/pom/article-form.page";

/** Acceptance criteria from docs/specs/articles-crud.md → Delete. */

test.describe("@regression delete article", () => {
  test("author can delete via the edit page button; subsequent GET 404s", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const article = await articleFactory.create(loggedInPage.request, { published: true });
    const form = new ArticleFormPage(loggedInPage);

    await form.gotoEdit(article.slug);
    await expect(form.deleteButton).toBeVisible();

    // Playwright dialogs — accept the confirm() before clicking.
    loggedInPage.once("dialog", (d) => d.accept());
    await form.deleteButton.click();

    // Follow-up API GET confirms the row is gone.
    const res = await loggedInPage.request.get(`/api/articles/${article.slug}`);
    expect(res.status()).toBe(404);
  });
});
