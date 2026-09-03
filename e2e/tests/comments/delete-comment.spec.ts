import { test, expect } from "@e2e/support/fixtures";
import { createLoggedInApi } from "@e2e/support/loginAs";
import { ArticleReadPage } from "@e2e/support/pom/article-read.page";

/**
 * Acceptance criteria for docs/specs/comments.md § Comment list + form
 * on the article read page — the delete affordance and the ownership
 * gate.
 */

test.describe("@regression comments — delete affordance", () => {
  test("author of a comment sees Delete on their own but not on others'", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
    commentFactory,
  }) => {
    const articleAuthor = await createLoggedInApi(browser, baseURL);
    const otherCommenter = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(articleAuthor.api, {
      published: true,
    });

    // The viewer (loggedInPage) posts one; the other user posts one.
    // Only the viewer's own row should carry the Delete button.
    await commentFactory.create(
      otherCommenter.api,
      article.slug,
      "someone else's comment",
    );
    await commentFactory.create(
      loggedInPage.request,
      article.slug,
      "my comment",
    );

    const read = new ArticleReadPage(loggedInPage);
    await read.gotoSlug(article.slug);

    // Own row → delete button present.
    const ownRow = read.commentList
      .getByRole("listitem")
      .filter({ hasText: "my comment" });
    await expect(
      ownRow.getByRole("button", { name: /^Delete your comment posted/ }),
    ).toBeVisible();

    // Others' row → no delete button at all.
    const othersRow = read.commentList
      .getByRole("listitem")
      .filter({ hasText: "someone else's comment" });
    await expect(
      othersRow.getByRole("button", { name: /^Delete your comment posted/ }),
    ).toHaveCount(0);

    await articleAuthor.context.close();
    await otherCommenter.context.close();
  });

  test("clicking Delete removes the comment without a full page reload", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
    commentFactory,
  }) => {
    const articleAuthor = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(articleAuthor.api, {
      published: true,
    });
    await commentFactory.create(loggedInPage.request, article.slug, "adieu");

    const read = new ArticleReadPage(loggedInPage);
    await read.gotoSlug(article.slug);
    const row = read.commentList
      .getByRole("listitem")
      .filter({ hasText: "adieu" });

    // Baseline count on the heading before delete.
    await expect(read.commentsHeading).toContainText("(1)");
    await row
      .getByRole("button", { name: /^Delete your comment posted/ })
      .click();

    // Row disappears; header count decrements.
    await expect(row).toHaveCount(0);
    await expect(read.commentsHeading).toContainText("(0)");

    await articleAuthor.context.close();
  });

  test("article author on someone else's comment sees no Delete button", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
    commentFactory,
  }) => {
    const otherCommenter = await createLoggedInApi(browser, baseURL);
    // Article author is the viewer here.
    const article = await articleFactory.create(loggedInPage.request, {
      published: true,
    });
    await commentFactory.create(
      otherCommenter.api,
      article.slug,
      "not yours to remove",
    );

    const read = new ArticleReadPage(loggedInPage);
    await read.gotoSlug(article.slug);
    const row = read.commentList.getByRole("listitem");
    // Not the comment author → no delete affordance, even as article
    // author. Article-author moderation is out of scope for v1.
    await expect(
      row.getByRole("button", { name: /^Delete your comment posted/ }),
    ).toHaveCount(0);

    await otherCommenter.context.close();
  });
});
