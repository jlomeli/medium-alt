import { test, expect } from "@e2e/support/fixtures";
import { createLoggedInApi } from "@e2e/support/loginAs";

/**
 * Acceptance criteria from docs/specs/follow.md → § Your Feed
 * pagination + `?feed=me&tag=` behaviour.
 */

test.describe("@regression your feed pagination", () => {
  test("clicking Next surfaces stable, non-overlapping pages", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
    followFactory,
  }) => {
    const authorSession = await createLoggedInApi(browser, baseURL);
    // 3 published articles; page size 2 → page 1 = 2, page 2 = 1,
    // no page 3.
    const titles: string[] = [];
    for (let i = 0; i < 3; i++) {
      const a = await articleFactory.create(authorSession.api, {
        published: true,
        title: `YF page ${Date.now()}-${i}`,
      });
      titles.push(a.title);
    }

    await followFactory.create(loggedInPage.request, authorSession.user.username);

    await loggedInPage.goto("/?feed=me&limit=2");
    // Page 1: two of our three titles are visible.
    const firstPageMatches = await Promise.all(
      titles.map(async (t) =>
        (await loggedInPage.getByRole("link", { name: t }).count()) > 0,
      ),
    );
    const firstCount = firstPageMatches.filter(Boolean).length;
    expect(firstCount).toBe(2);
    // "Next" is present.
    const next = loggedInPage.getByRole("link", { name: "Next" });
    await expect(next).toBeVisible();

    await next.click();
    // Wait for navigation to settle — the cursor query param on the
    // URL is the load barrier we can key off. Without this, the
    // subsequent DOM reads race against the server component render.
    await expect(loggedInPage).toHaveURL(/cursor=/);
    await expect(loggedInPage).toHaveURL(/feed=me/);
    // Page 2: exactly one of our three titles is visible, and it's
    // different from page 1 (no duplicates).
    const secondPageMatches = await Promise.all(
      titles.map(async (t) =>
        (await loggedInPage.getByRole("link", { name: t }).count()) > 0,
      ),
    );
    const overlap = firstPageMatches.map((v, i) => v && secondPageMatches[i])
      .filter(Boolean).length;
    expect(overlap).toBe(0);
    expect(secondPageMatches.filter(Boolean).length).toBe(1);

    // "Next" is gone on the last page.
    await expect(loggedInPage.getByRole("link", { name: "Next" })).toHaveCount(0);

    await authorSession.context.close();
  });

  test("?feed=me&tag=<slug> ignores the tag param", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
    followFactory,
  }) => {
    const authorSession = await createLoggedInApi(browser, baseURL);
    // One tagged, one untagged — both from the followed author. On
    // Your Feed, the tag param is ignored, so BOTH must appear.
    const tagged = await articleFactory.create(authorSession.api, {
      published: true,
      tags: [`yf-ignore-${Date.now()}`],
      title: `Tagged ${Date.now()}`,
    });
    const untagged = await articleFactory.create(authorSession.api, {
      published: true,
      title: `Untagged ${Date.now()}`,
    });

    await followFactory.create(loggedInPage.request, authorSession.user.username);

    await loggedInPage.goto(`/?feed=me&tag=some-unrelated-tag`);
    // Both appear — the tag filter was ignored.
    await expect(
      loggedInPage.getByRole("link", { name: tagged.title }),
    ).toBeVisible();
    await expect(
      loggedInPage.getByRole("link", { name: untagged.title }),
    ).toBeVisible();

    await authorSession.context.close();
  });
});
