import { test, expect } from "@e2e/support/fixtures";
import { HeaderComponent } from "@e2e/support/pom/header.component";

/** Acceptance criteria from docs/specs/auth.md → Logout. */

test.describe("@smoke @regression logout", () => {
  test("@smoke logging out ends the session and lands on /", async ({ loggedInPage }) => {
    const header = new HeaderComponent(loggedInPage);

    await loggedInPage.goto("/");
    await header.logOut();

    await expect(loggedInPage).toHaveURL("/");
    await expect(header.logInLink).toBeVisible();
    await expect(header.accountMenuButton).toHaveCount(0);
  });

  test("after logout, protected page redirects to /login?callbackUrl=<original>", async ({
    loggedInPage,
  }) => {
    const header = new HeaderComponent(loggedInPage);
    await loggedInPage.goto("/");
    await header.logOut();

    await loggedInPage.goto("/me");

    await expect(loggedInPage).toHaveURL(/\/login\?callbackUrl=%2Fme/);
  });
});
