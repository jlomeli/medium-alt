import { randomBytes } from "node:crypto";
import { test, expect } from "@e2e/support/fixtures";
import { createLoggedInApi } from "@e2e/support/loginAs";

/**
 * Acceptance criteria for docs/specs/comments.md § Comment count on
 * feed cards + section header. Every listing surface (Global, tag
 * filter, profile section, Your Feed) renders the aggregate on the
 * card.
 *
 * Same tag-per-run isolation pattern as claps counts-on-cards.
 */

function uniqueTag(): string {
  return `comments-${randomBytes(4).toString("hex")}`;
}

test.describe("@regression comments — count on cards", () => {
  test("Global feed card renders the article's comment count", async ({
    browser,
    baseURL,
    page,
    articleFactory,
    commentFactory,
  }) => {
    const tag = uniqueTag();
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
      tags: [tag],
    });
    const reader = await createLoggedInApi(browser, baseURL);
    await commentFactory.create(reader.api, article.slug, "one");
    await commentFactory.create(reader.api, article.slug, "two");
    await commentFactory.create(reader.api, article.slug, "three");

    await page.goto(`/?tag=${tag}`);
    const card = page.getByRole("article").filter({
      has: page.getByRole("heading", { level: 2, name: article.title }),
    });
    await expect(card).toBeVisible();
    // Announced as "Comment count" (mirrors "Clap count").
    await expect(card.getByLabel("Comment count")).toHaveText("3");

    await author.context.close();
    await reader.context.close();
  });

  test("card renders '0' for a never-commented article (no hidden field)", async ({
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
    await expect(card.getByLabel("Comment count")).toHaveText("0");

    await author.context.close();
  });

  test("profile /profiles/[username] card renders comment count", async ({
    browser,
    baseURL,
    page,
    articleFactory,
    commentFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });
    const reader = await createLoggedInApi(browser, baseURL);
    await commentFactory.create(reader.api, article.slug, "one");
    await commentFactory.create(reader.api, article.slug, "two");

    await page.goto(`/profiles/${author.user.username}`);
    const row = page
      .getByRole("listitem")
      .filter({ has: page.getByRole("link", { name: article.title }) });
    await expect(row).toBeVisible();
    await expect(row.getByLabel("Comment count")).toHaveText("2");

    await author.context.close();
    await reader.context.close();
  });

  test("Your Feed card renders comment count", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
    followFactory,
    commentFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });
    const reader = await createLoggedInApi(browser, baseURL);
    await commentFactory.create(reader.api, article.slug, "only one");
    await followFactory.create(loggedInPage.request, author.user.username);

    await loggedInPage.goto("/?feed=me");
    const card = loggedInPage.getByRole("article").filter({
      has: loggedInPage.getByRole("heading", { level: 2, name: article.title }),
    });
    await expect(card).toBeVisible();
    await expect(card.getByLabel("Comment count")).toHaveText("1");

    await author.context.close();
    await reader.context.close();
  });
});
