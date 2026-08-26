import { test, expect } from "@e2e/support/fixtures";
import { HomePage } from "@e2e/support/pom/home.page";

test.describe("@smoke homepage", () => {
  test("renders the placeholder home page", async ({ page }) => {
    const home = new HomePage(page);
    await home.goto();

    await expect(home.heading).toBeVisible();
    await expect(home.tagline).toBeVisible();
  });
});
