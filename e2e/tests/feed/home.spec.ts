import { randomBytes } from "node:crypto";
import { test, expect } from "@e2e/support/fixtures";

/**
 * `/` — home global feed. See docs/specs/tags-feed.md § UI surface.
 *
 * All assertions are scoped to a per-test unique tag so seeded and
 * concurrent-test articles never pollute the view under test.
 */

function uniqueTag(): string {
  return `home-${randomBytes(4).toString("hex")}`;
}

test.describe("@smoke @regression home feed", () => {
  test("renders published articles as cards with author + tag chips", async ({
    page,
    loggedInPage,
    articleFactory,
  }) => {
    const tag = uniqueTag();
    const article = await articleFactory.create(loggedInPage.request, {
      published: true,
      tags: [tag],
    });

    await page.goto(`/?tag=${tag}`);
    // Filter heading confirms we're on the tag-scoped view.
    await expect(
      page.getByRole("heading", { level: 1, name: `#${tag}` }),
    ).toBeVisible();
    // The card is rendered as an <article> with the title inside an <h2>.
    const cardTitle = page.getByRole("heading", { level: 2, name: article.title });
    await expect(cardTitle).toBeVisible();

    // Tag chip is a link with rel="tag" pointing at ?tag=<slug>.
    const chip = page.getByRole("link", { name: `#${tag}` }).first();
    await expect(chip).toHaveAttribute("href", `/?tag=${encodeURIComponent(tag)}`);
    await expect(chip).toHaveAttribute("rel", "tag");
  });

  test("unknown tag renders an empty state — not a 404", async ({ page }) => {
    const tag = uniqueTag();
    const res = await page.goto(`/?tag=${tag}`);
    expect(res?.status()).toBe(200);
    await expect(page.getByText(`No articles yet under #${tag}.`)).toBeVisible();
  });

  test("card title link navigates to /articles/[slug]", async ({
    page,
    loggedInPage,
    articleFactory,
  }) => {
    const tag = uniqueTag();
    const article = await articleFactory.create(loggedInPage.request, {
      published: true,
      tags: [tag],
    });
    await page.goto(`/?tag=${tag}`);
    await page
      .getByRole("heading", { level: 2, name: article.title })
      .getByRole("link", { name: article.title })
      .click();
    await expect(page).toHaveURL(`/articles/${article.slug}`);
  });
});
