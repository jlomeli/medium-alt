import { test, expect } from "@e2e/support/fixtures";
import { createLoggedInApi } from "@e2e/support/loginAs";
import { ArticleReadPage } from "@e2e/support/pom/article-read.page";

/**
 * Acceptance criteria for docs/specs/claps.md § Clap button — the
 * optimistic-UI cadence + cap + revert behaviours. These are the
 * reasons this slice earns its slot on the roadmap.
 */

test.describe("@regression claps — optimistic UI", () => {
  test("rapid clicks bump the total synchronously (before the server responds)", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });

    // Hold the POST responses. Any impl that only bumps the visible
    // count after the fetch resolves will fail the "count reads 10
    // while POST is still in flight" assertion below — the whole
    // reason this test earns its slot on the roadmap. A plain
    // `toHaveText("10")` at the end of a sequence of clicks would
    // auto-retry through the reconciliation and let that impl pass
    // silently.
    let releaseHeldPosts!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseHeldPosts = resolve;
    });
    let heldPosts = 0;
    let completedPosts = 0;
    let totalApplied = 0;
    await loggedInPage.route(
      `**/api/articles/${article.slug}/claps`,
      async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        heldPosts += 1;
        await gate;
        const response = await route.fetch();
        const body = (await response.json()) as {
          viewerCount: number;
          totalCount: number;
        };
        totalApplied = body.viewerCount;
        completedPosts += 1;
        await route.fulfill({ response });
      },
    );

    const read = new ArticleReadPage(loggedInPage);
    await read.gotoSlug(article.slug);
    await expect(read.clapTotal).toHaveText("0");

    for (let i = 0; i < 10; i++) {
      await read.clapButton.click();
    }

    // Assert the optimistic state WHILE the POST is still pending.
    // The client's batching queue collapses the 10 clicks into a
    // small number of in-flight requests (typically 1–2), so a POST
    // is guaranteed to be sitting at the gate at this point.
    await expect(read.clapTotal).toHaveText("10");
    await expect(read.clapButton).toHaveAccessibleName(/10\s*\/\s*50/);
    expect(heldPosts).toBeGreaterThan(0);

    // Release the held responses and let reconciliation land.
    releaseHeldPosts();
    // Post-reconciliation count still reads 10 — the server truth
    // matches the optimistic value. The retry-until-idle here
    // waits for the drain-queue's follow-up POST to settle so the
    // reload below sees the final DB state.
    await expect(read.clapTotal).toHaveText("10");
    // Wait for the drain-queue POST to settle so the reload sees the
    // final DB state — otherwise reload aborts the in-flight request
    // and the DB only holds the first POST's 1 clap.
    await expect
      .poll(() => totalApplied, { timeout: 5000 })
      .toBe(10);
    await loggedInPage.unroute(`**/api/articles/${article.slug}/claps`);

    // Reload to prove the reconciliation matches the DB.
    await loggedInPage.reload();
    await expect(read.clapTotal).toHaveText("10");
    // Sanity check: the batching queue really did collapse the 10
    // clicks — we should see ~2 POSTs total (one initial + one drain),
    // not 10.
    expect(completedPosts).toBeLessThanOrEqual(3);

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
