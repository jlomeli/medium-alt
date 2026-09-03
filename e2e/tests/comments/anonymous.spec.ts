import { test, expect } from "@e2e/support/fixtures";
import { createLoggedInApi } from "@e2e/support/loginAs";
import { ArticleReadPage } from "@e2e/support/pom/article-read.page";

/**
 * Acceptance criteria for docs/specs/comments.md § Comment list + form
 * on the article read page — the anonymous branch.
 */

test.describe("@smoke @regression comments — anonymous visitor", () => {
  test("anonymous sees the list and a Sign-in-to-comment link, no form", async ({
    browser,
    baseURL,
    page,
    articleFactory,
    commentFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const commenter = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });
    await commentFactory.create(commenter.api, article.slug, "public thought");

    const read = new ArticleReadPage(page);
    await read.gotoSlug(article.slug);

    // The list is visible — comments are public.
    await expect(read.commentList.getByRole("listitem")).toContainText(
      "public thought",
    );

    // But the form is not — no textarea, no submit button.
    await expect(read.commentForm).toHaveCount(0);
    await expect(read.commentTextarea).toHaveCount(0);
    await expect(read.commentSubmit).toHaveCount(0);

    // Instead: a `<Link>` (not a button) pointing to /login with the
    // callbackUrl set to the current article.
    await expect(read.signInToCommentLink).toBeVisible();
    await read.signInToCommentLink.click();
    await expect(page).toHaveURL(
      new RegExp(
        `/login\\?callbackUrl=${encodeURIComponent(
          `/articles/${article.slug}`,
        )}`,
      ),
    );

    await author.context.close();
    await commenter.context.close();
  });
});
