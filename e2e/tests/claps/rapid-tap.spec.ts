import { test, expect } from "@e2e/support/fixtures";
import { createLoggedInApi } from "@e2e/support/loginAs";
import { ArticleReadPage } from "@e2e/support/pom/article-read.page";

/**
 * Acceptance criteria for docs/specs/claps.md § Clap button — the
 * optimistic-UI cadence + cap + revert behaviours. These are the
 * reasons this slice earns its slot on the roadmap.
 */

test.describe("@regression claps — optimistic UI", () => {
  test("rapid clicks bump the total synchronously", async ({
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
    await expect(read.clapTotal).toHaveText("0");

    // Ten rapid clicks. The optimistic layer must render "10" before
    // any of the network responses have landed — we assert the count
    // via toHaveText (auto-retries) which lets the intermediate
    // optimistic state satisfy the check without racing.
    for (let i = 0; i < 10; i++) {
      await read.clapButton.click();
    }
    // Final reconciled state matches the tap count.
    await expect(read.clapTotal).toHaveText("10");
    await expect(read.clapButton).toHaveAccessibleName(/10\s*\/\s*50/);

    // Reload to prove the reconciliation matches the DB.
    await loggedInPage.reload();
    await expect(read.clapTotal).toHaveText("10");

    await author.context.close();
  });

  test("51st click at the 50-cap is a no-op", async ({
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
    // Seed the viewer's own count to 50 via the batch API so the test
    // isn't 50 sequential clicks. The batch endpoint enforces the cap
    // server-side.
    await clapFactory.create(loggedInPage.request, article.slug, {
      delta: 50,
    });

    const read = new ArticleReadPage(loggedInPage);
    await read.gotoSlug(article.slug);
    await expect(read.clapTotal).toHaveText("50");
    await expect(read.clapButton).toHaveAccessibleName(/50\s*\/\s*50/);

    // Extra clicks after the cap are visibly refused. Any POST that
    // does still land at the server returns totals unchanged, so the
    // final rendered total stays 50.
    await read.clapButton.click();
    await read.clapButton.click();
    await expect(read.clapTotal).toHaveText("50");

    await loggedInPage.reload();
    await expect(read.clapTotal).toHaveText("50");

    await author.context.close();
  });

  test("server error reverts the optimistic bump and surfaces an alert", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });

    // Force the POST to fail without touching app code — Playwright's
    // network layer intercepts before the request reaches the server.
    await loggedInPage.route(
      `**/api/articles/${article.slug}/claps`,
      async (route) => {
        if (route.request().method() === "POST") {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "internal" }),
          });
          return;
        }
        await route.continue();
      },
    );

    const read = new ArticleReadPage(loggedInPage);
    await read.gotoSlug(article.slug);
    await expect(read.clapTotal).toHaveText("0");

    await read.clapButton.click();
    // The alert appears with the documented copy and the optimistic
    // total reverts back to 0 — the viewer is never lied to.
    await expect(read.clapError).toBeVisible();
    await expect(read.clapError).toContainText(/couldn't save your clap/i);
    await expect(read.clapTotal).toHaveText("0");

    // Button stays enabled — the viewer can retry.
    await expect(read.clapButton).toBeEnabled();

    await author.context.close();
  });
});
