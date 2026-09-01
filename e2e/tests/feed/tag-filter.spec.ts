import { randomBytes } from "node:crypto";
import { test, expect } from "@e2e/support/fixtures";

/**
 * Tag filter + popular-tags sidebar. See docs/specs/tags-feed.md §
 * Popular tags and § Global feed.
 *
 * Both tests seed their own tagged articles rather than leaning on
 * baseline seed data — keeps behaviour deterministic across a
 * `pnpm db:reset` cycle, avoids coupling to any specific seeded tag
 * name, and makes the tests survive a rewrite of `prisma/seeds/`.
 */

function uniqueTag(): string {
  return `filter-${randomBytes(4).toString("hex")}`;
}

test.describe("@smoke tag filter + popular tags sidebar", () => {
  test("popular-tags sidebar renders + links to a tag-filtered feed", async ({
    page,
    loggedInPage,
    articleFactory,
  }) => {
    // Three articles under one tag: high enough count to place it in
    // the default top-20 popular-tags even under concurrent-test load.
    const tag = uniqueTag();
    for (let i = 0; i < 3; i++) {
      await articleFactory.create(loggedInPage.request, {
        published: true,
        tags: [tag],
      });
    }

    await page.goto("/");
    const sidebar = page.getByRole("complementary");
    await expect(
      sidebar.getByRole("heading", { name: "Popular tags" }),
    ).toBeVisible();
    // The sidebar entry for our tag: `#<slug>  3` — assert on the
    // slug half of the label via regex.
    const link = sidebar.getByRole("link", { name: new RegExp(`#${tag}`) });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute(
      "href",
      `/?tag=${encodeURIComponent(tag)}`,
    );
  });

  test("landing on ?tag= marks the sidebar entry with aria-current=page + shows Clear filter", async ({
    page,
    loggedInPage,
    articleFactory,
  }) => {
    const tag = uniqueTag();
    for (let i = 0; i < 2; i++) {
      await articleFactory.create(loggedInPage.request, {
        published: true,
        tags: [tag],
      });
    }
    await page.goto(`/?tag=${tag}`);
    const sidebar = page.getByRole("complementary");
    const activeLink = sidebar.getByRole("link", {
      name: new RegExp(`#${tag}`),
    });
    await expect(activeLink).toHaveAttribute("aria-current", "page");
    await expect(
      sidebar.getByRole("link", { name: "Clear filter" }),
    ).toBeVisible();
  });
});
