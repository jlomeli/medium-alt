import { randomBytes } from "node:crypto";
import { test, expect } from "@e2e/support/fixtures";

/**
 * Feed pagination. Verifies the "Next" affordance appears when there
 * are more items, disappears at the end, and that navigating "Next"
 * reveals non-overlapping items. See docs/specs/tags-feed.md §
 * Global feed.
 */

function uniqueTag(): string {
  return `page-${randomBytes(4).toString("hex")}`;
}

test.describe("@regression feed pagination", () => {
  test("Next link appears at limit, resumes into a non-overlapping page, then disappears", async ({
    page,
    loggedInPage,
    articleFactory,
  }) => {
    const tag = uniqueTag();
    // Three articles, sequential creation so publishedAt ordering is
    // deterministic. Titles carry the tag so per-title assertions
    // don't collide with other test articles.
    const titles: string[] = [];
    for (let i = 0; i < 3; i++) {
      const a = await articleFactory.create(loggedInPage.request, {
        published: true,
        tags: [tag],
        title: `${tag} article #${i + 1}`,
      });
      titles.push(a.title);
    }

    await page.goto(`/?tag=${tag}&limit=2`);
    // Only the two newest are on page 1. Newest is `#3` (created last).
    await expect(page.getByRole("heading", { level: 2, name: titles[2]! })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: titles[1]! })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: titles[0]! })).toHaveCount(0);

    const nextLink = page.getByRole("link", { name: "Next" });
    await expect(nextLink).toBeVisible();
    await nextLink.click();

    // Page 2: the remaining (oldest) article shows, the two newest
    // are gone, and the Next link is absent.
    await expect(page.getByRole("heading", { level: 2, name: titles[0]! })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: titles[1]! })).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2, name: titles[2]! })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Next" })).toHaveCount(0);
  });
});
