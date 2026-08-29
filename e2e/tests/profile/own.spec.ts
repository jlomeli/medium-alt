import { test, expect } from "@e2e/support/fixtures";
import { OwnProfilePage } from "@e2e/support/pom/own-profile.page";

/**
 * Acceptance criteria from docs/specs/profile.md → Own profile (`/me`).
 *
 * RED until the profile feature ships.
 */

test.describe("@smoke own profile", () => {
  test("shows the signed-in user's name, username, and email", async ({ loggedInPage }) => {
    const own = new OwnProfilePage(loggedInPage);
    await own.goto();

    await expect(own.heading).toBeVisible();
    // The loggedInPage fixture creates a fresh user whose factory attrs
    // include name = `Test User ${slug}`, username = slug, and
    // email = `${slug}@example.test`. Match the slug prefix and shape;
    // the exact random suffix is captured by the fixture.
    await expect(loggedInPage.getByText(/Test User u-[a-f0-9]{8}/)).toBeVisible();
    await expect(loggedInPage.getByText(/@u-[a-f0-9]{8}/)).toBeVisible();
    await expect(loggedInPage.getByText(/u-[a-f0-9]{8}@example\.test/)).toBeVisible();
  });

  test("has an Edit profile link that navigates to /me/edit", async ({ loggedInPage }) => {
    const own = new OwnProfilePage(loggedInPage);
    await own.goto();

    await expect(own.editProfileLink).toBeVisible();
    await own.editProfileLink.click();
    await expect(loggedInPage).toHaveURL("/me/edit");
  });
});
