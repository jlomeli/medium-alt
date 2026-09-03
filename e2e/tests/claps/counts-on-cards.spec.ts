import { randomBytes } from "node:crypto";
import { test, expect } from "@e2e/support/fixtures";
import { createLoggedInApi } from "@e2e/support/loginAs";

/**
 * Acceptance criteria for docs/specs/claps.md § Clap counts on feed
 * cards. Every listing surface (Global, tag filter, profile section,
 * Your Feed) renders the aggregate on the card.
 *
 * Each test scopes to a per-run unique tag so the article-under-test
 * is the only one visible in its feed view — no ordering fragility
 * against the seeded baseline or concurrent workers.
 */

function uniqueTag(): string {
  return `claps-${randomBytes(4).toString("hex")}`;
}

test.describe("@regression claps — count on cards", () => {
  test("Global feed card renders the article's clap count", async ({
    browser,
    baseURL,
    page,
    articleFactory,
    clapFactory,
  }) => {
    const tag = uniqueTag();
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
      tags: [tag],
    });
    const reader = await createLoggedInApi(browser, baseURL);
    await clapFactory.create(reader.api, article.slug, { delta: 6 });

    await page.goto(`/?tag=${tag}`);
    // Scope to the specific card so a matching text elsewhere on the
    // page can't mask a bug.
    const card = page.getByRole("article").filter({
      has: page.getByRole("heading", { level: 2, name: article.title }),
    });
    await expect(card).toBeVisible();
    // The count is announced as "Clap count" — `getByLabel` binds to
    // the aria-label without a testid.
    await expect(card.getByLabel("Clap count")).toHaveText("6");

    await author.context.close();
    await reader.context.close();
  });

  test("card renders '0' for a never-clapped article (no hidden field)", async ({
    browser,
    baseURL,
    page,
    articleFactory,
  }) => {
    const tag = uniqueTag();
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
      tags: [tag],
    });

    await page.goto(`/?tag=${tag}`);
    const card = page.getByRole("article").filter({
      has: page.getByRole("heading", { level: 2, name: article.title }),
    });
    await expect(card.getByLabel("Clap count")).toHaveText("0");

    await author.context.close();
  });

  test("profile /profiles/[username] card renders clap count", async ({
    browser,
    baseURL,
    page,
    articleFactory,
    clapFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });
    const reader = await createLoggedInApi(browser, baseURL);
    await clapFactory.create(reader.api, article.slug, { delta: 9 });

    await page.goto(`/profiles/${author.user.username}`);
    // The profile listing uses an inline `<li>` (not `<ArticleCard>`);
    // find the row by its article-title link and assert the count on
    // its sibling `<ClapCount>`. Same aria-label ("Clap count") is
    // shared across surfaces so the query is uniform.
    const row = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("link", { name: article.title }) });
    await expect(row).toBeVisible();
    await expect(row.getByLabel("Clap count")).toHaveText("9");

    await author.context.close();
    await reader.context.close();
  });

  test("Your Feed card renders clap count", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
    followFactory,
    clapFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });
    const reader = await createLoggedInApi(browser, baseURL);
    await clapFactory.create(reader.api, article.slug, { delta: 4 });
    await followFactory.create(loggedInPage.request, author.user.username);

    await loggedInPage.goto("/?feed=me");
    const card = loggedInPage.getByRole("article").filter({
      has: loggedInPage.getByRole("heading", { level: 2, name: article.title }),
    });
    await expect(card).toBeVisible();
    await expect(card.getByLabel("Clap count")).toHaveText("4");

    await author.context.close();
    await reader.context.close();
  });
});
