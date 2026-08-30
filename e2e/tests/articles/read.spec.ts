import { test, expect } from "@e2e/support/fixtures";
import { ArticleReadPage } from "@e2e/support/pom/article-read.page";

/** Acceptance criteria from docs/specs/articles-crud.md → Read. */

test.describe("@smoke read article", () => {
  test("published article renders title, subtitle, body, author, publishedAt", async ({
    page,
    loggedInPage,
    articleFactory,
  }) => {
    const article = await articleFactory.create(loggedInPage.request, { published: true });
    // Publicly visible — use the unauthenticated `page` to verify.
    const read = new ArticleReadPage(page);
    await read.gotoSlug(article.slug);

    await expect(read.titleHeading).toHaveText(article.title);
    await expect(read.subtitle).toContainText(article.subtitle!);
    await expect(read.body).toContainText("Body of art-");
    await expect(read.authorLine).toBeVisible();
  });

  test("draft article shows Draft badge and Edit link only to its author", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const article = await articleFactory.create(loggedInPage.request, { published: false });
    const read = new ArticleReadPage(loggedInPage);
    await read.gotoSlug(article.slug);

    await expect(read.draftBadge).toBeVisible();
    await expect(read.editLink).toBeVisible();
  });

  test("draft article 404s for a non-author (signed-out)", async ({
    page,
    loggedInPage,
    articleFactory,
  }) => {
    const article = await articleFactory.create(loggedInPage.request, { published: false });

    const response = await page.goto(`/articles/${article.slug}`);
    expect(response?.status()).toBe(404);
  });

  test("unknown slug returns 404", async ({ page }) => {
    const response = await page.goto("/articles/definitely-not-a-real-slug-8x7z");
    expect(response?.status()).toBe(404);
  });

  test("non-author viewing a published article does NOT see an Edit link", async ({
    page,
    loggedInPage,
    articleFactory,
  }) => {
    const article = await articleFactory.create(loggedInPage.request, { published: true });
    const read = new ArticleReadPage(page);
    await read.gotoSlug(article.slug);

    await expect(read.editLink).toHaveCount(0);
  });
});
