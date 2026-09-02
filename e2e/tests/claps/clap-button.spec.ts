import { test, expect } from "@e2e/support/fixtures";
import { createLoggedInApi } from "@e2e/support/loginAs";
import { ArticleReadPage } from "@e2e/support/pom/article-read.page";

/**
 * Acceptance criteria for docs/specs/claps.md § Clap button on the
 * article read page.
 */

test.describe("@smoke @regression claps — read page button", () => {
  test("signed-in reader can clap on another user's article", async ({
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

    await expect(read.clapButton).toBeVisible();
    await expect(read.clapTotal).toHaveText("0");

    await read.clapButton.click();
    // After the server round-trip settles, the total updates and the
    // button's accessible name reflects the viewer's count.
    await expect(read.clapTotal).toHaveText("1");
    await expect(read.clapButton).toHaveAccessibleName(/1\s*\/\s*50/);

    await author.context.close();
  });

  test("clap state survives a full page reload", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
    clapFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });
    await clapFactory.create(loggedInPage.request, article.slug, { delta: 3 });

    const read = new ArticleReadPage(loggedInPage);
    await read.gotoSlug(article.slug);
    // Rehydrates from the DB, not client state.
    await expect(read.clapTotal).toHaveText("3");
    await expect(read.clapButton).toHaveAccessibleName(/3\s*\/\s*50/);

    await loggedInPage.reload();
    await expect(read.clapTotal).toHaveText("3");
    await expect(read.clapButton).toHaveAccessibleName(/3\s*\/\s*50/);

    await author.context.close();
  });

  test("author viewing their own article sees no clap button", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const own = await articleFactory.create(loggedInPage.request, {
      published: true,
    });
    const read = new ArticleReadPage(loggedInPage);
    await read.gotoSlug(own.slug);

    // Absence, not disabled — the affordance is not in the DOM at all.
    await expect(read.clapButton).toHaveCount(0);
    await expect(read.clapLink).toHaveCount(0);
    // The total still renders — an author reads their own reception too.
    await expect(read.clapTotal).toHaveText("0");
  });

  test("anonymous click on Clap redirects to /login with callbackUrl", async ({
    browser,
    baseURL,
    page,
    articleFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });

    const read = new ArticleReadPage(page);
    await read.gotoSlug(article.slug);

    // Anonymous fallback renders as a link, not a button.
    await expect(read.clapLink).toBeVisible();
    await read.clapLink.click();
    await expect(page).toHaveURL(
      new RegExp(
        `/login\\?callbackUrl=${encodeURIComponent(
          `/articles/${article.slug}`,
        )}`,
      ),
    );

    await author.context.close();
  });
});
