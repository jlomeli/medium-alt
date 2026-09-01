import { test, expect } from "@e2e/support/fixtures";
import { HomePage } from "@e2e/support/pom/home.page";

/**
 * Smoke: `/` renders the global feed shell — a "Latest articles"
 * landmark and a "Popular tags" sidebar. See docs/specs/tags-feed.md
 * § UI surface.
 */
test.describe("@smoke homepage", () => {
  test("renders the global feed shell", async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();
    await expect(home.heading).toBeVisible();
    await expect(home.popularTagsHeading).toBeVisible();
  });
});
