import { test, expect } from "@e2e/support/fixtures";
import { createLoggedInApi } from "@e2e/support/loginAs";
import { ArticleReadPage } from "@e2e/support/pom/article-read.page";

/**
 * Acceptance criteria for docs/specs/comments.md § Comment list + form
 * on the article read page — the write path.
 */

test.describe("@smoke @regression comments — comment form", () => {
  test("signed-in reader posts a comment; it appears and textarea clears", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });

    const read = new ArticleReadPage(loggedInPage);
    await read.gotoSlug(article.slug);

    await expect(read.commentForm).toBeVisible();
    await expect(read.commentTextarea).toBeVisible();
    await expect(read.commentSubmit).toBeVisible();

    await read.commentTextarea.fill("first thoughts");
    await read.commentSubmit.click();

    // The new comment appears in the list.
    await expect(read.commentList.getByRole("listitem")).toContainText(
      "first thoughts",
    );
    // Textarea cleared, focus returned.
    await expect(read.commentTextarea).toHaveValue("");
    await expect(read.commentTextarea).toBeFocused();

    await author.context.close();
  });

  test("empty body surfaces an inline alert and does not post", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });

    const read = new ArticleReadPage(loggedInPage);
    await read.gotoSlug(article.slug);
    await read.commentTextarea.fill("   ");
    await read.commentSubmit.click();

    await expect(read.commentError).toContainText("Comment can't be empty");
    // No comments were added to the empty list.
    await expect(read.commentList.getByRole("listitem")).toHaveCount(0);

    await author.context.close();
  });

  test("body over 2000 chars surfaces an inline alert and does not post", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });

    const read = new ArticleReadPage(loggedInPage);
    await read.gotoSlug(article.slug);
    await read.commentTextarea.fill("x".repeat(2001));
    await read.commentSubmit.click();

    await expect(read.commentError).toContainText(
      /too long|max 2000/i,
    );
    await expect(read.commentList.getByRole("listitem")).toHaveCount(0);

    await author.context.close();
  });

  test("posted comment persists across a full reload", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
    commentFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });
    await commentFactory.create(loggedInPage.request, article.slug, "seeded");

    const read = new ArticleReadPage(loggedInPage);
    await read.gotoSlug(article.slug);
    await expect(read.commentList.getByRole("listitem")).toContainText("seeded");

    await loggedInPage.reload();
    await expect(read.commentList.getByRole("listitem")).toContainText("seeded");

    await author.context.close();
  });

  test("author can self-comment on their own published article", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const own = await articleFactory.create(loggedInPage.request, {
      published: true,
    });

    const read = new ArticleReadPage(loggedInPage);
    await read.gotoSlug(own.slug);
    await expect(read.commentForm).toBeVisible();

    await read.commentTextarea.fill("PS, I forgot to add X");
    await read.commentSubmit.click();

    await expect(read.commentList.getByRole("listitem")).toContainText(
      "PS, I forgot to add X",
    );
  });

  test("draft page (author viewing own draft) has no comments section", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const draft = await articleFactory.create(loggedInPage.request, {
      published: false,
    });

    const read = new ArticleReadPage(loggedInPage);
    await read.gotoSlug(draft.slug);
    // Absence, not disabled — the region is not in the DOM at all.
    await expect(read.commentsRegion).toHaveCount(0);
  });
});
