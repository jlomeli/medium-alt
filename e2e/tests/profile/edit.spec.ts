import { test, expect } from "@e2e/support/fixtures";
import { EditProfilePage } from "@e2e/support/pom/edit-profile.page";
import { OwnProfilePage } from "@e2e/support/pom/own-profile.page";

/**
 * Acceptance criteria from docs/specs/profile.md → Edit profile.
 */

test.describe("@regression edit profile", () => {
  test("prefills fields with the current user's values", async ({ loggedInPage }) => {
    const edit = new EditProfilePage(loggedInPage);
    await edit.goto();

    await expect(edit.heading).toBeVisible();
    await expect(edit.usernameField).toHaveValue(/^u-[a-f0-9]{8}$/);
    await expect(edit.nameField).toHaveValue(/^Test User u-[a-f0-9]{8}$/);
    await expect(edit.bioField).toHaveValue("");
  });

  test("valid update persists and lands back on /me with new values", async ({ loggedInPage }) => {
    const edit = new EditProfilePage(loggedInPage);
    const own = new OwnProfilePage(loggedInPage);
    await edit.goto();

    await edit.fill({ name: "Ada Lovelace", bio: "First hacker" });
    await edit.submit();

    await expect(loggedInPage).toHaveURL("/me");
    await expect(own.heading).toBeVisible();
    await expect(loggedInPage.getByText("Ada Lovelace")).toBeVisible();
    await expect(loggedInPage.getByText("First hacker")).toBeVisible();
  });

  test("duplicate username surfaces an inline error and does not update", async ({
    loggedInPage,
    userFactory,
  }) => {
    // A second user, created via factory to reserve the username we'll try
    // to steal.
    const other = await userFactory.create();
    const edit = new EditProfilePage(loggedInPage);
    await edit.goto();

    await edit.fill({ username: other.username });
    await edit.submit();

    await expect(loggedInPage.getByText(/username is taken/i)).toBeVisible();
    await expect(loggedInPage).toHaveURL(/\/me\/edit/);
  });

  test("username failing policy shows a field-level error", async ({ loggedInPage }) => {
    const edit = new EditProfilePage(loggedInPage);
    await edit.goto();

    await edit.fill({ username: "ab" }); // < 3 chars
    await edit.submit();

    await expect(loggedInPage.getByText(/username must be at least 3 characters/i)).toBeVisible();
    await expect(loggedInPage).toHaveURL(/\/me\/edit/);
  });

  test("bio longer than the max length is rejected inline", async ({ loggedInPage }) => {
    const edit = new EditProfilePage(loggedInPage);
    await edit.goto();

    await edit.fill({ bio: "x".repeat(281) });
    await edit.submit();

    await expect(loggedInPage.getByText(/bio must be at most 280 characters/i)).toBeVisible();
    await expect(loggedInPage).toHaveURL(/\/me\/edit/);
  });

  test("signed-out visitor is redirected to /login with callbackUrl=%2Fme%2Fedit", async ({
    page,
  }) => {
    await page.goto("/me/edit");
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fme%2Fedit/);
  });
});
