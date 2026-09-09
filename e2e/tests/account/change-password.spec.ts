import { test, expect } from "@e2e/support/fixtures";
import { EditProfilePage } from "@e2e/support/pom/edit-profile.page";
import { HeaderComponent } from "@e2e/support/pom/header.component";

/**
 * Acceptance criteria from docs/specs/account-security.md → Change
 * password (`/me/edit` § Password).
 *
 * All journeys use the `loggedInUser` fixture — this suite needs both
 * the browser page AND the user's current password, so `loggedInPage`
 * (which discards the credentials) isn't enough.
 */
test.describe("@regression change password", () => {
  test("@smoke happy path — session preserved, success indicator", async ({
    loggedInUser,
  }) => {
    const { page, user } = loggedInUser;
    const editPage = new EditProfilePage(page);
    const header = new HeaderComponent(page);
    const newPassword = "Newp@ss-word-9";

    await editPage.goto();
    await editPage.password.fill({
      current: user.password,
      next: newPassword,
      confirm: newPassword,
    });
    await editPage.password.submit();

    await expect(editPage.password.form.getByText("Password changed.")).toBeVisible();
    // Session still authenticated — the account menu (signed-in-only affordance)
    // is still visible without any navigation.
    await expect(header.accountMenuButton).toBeVisible();
  });

  test("wrong current password — inline error, hash unchanged", async ({
    loggedInUser,
  }) => {
    const { page } = loggedInUser;
    const editPage = new EditProfilePage(page);

    await editPage.goto();
    await editPage.password.fill({
      current: "wrong-password-nope-9",
      next: "Newp@ss-word-9",
      confirm: "Newp@ss-word-9",
    });
    await editPage.password.submit();

    await expect(
      editPage.password.form.getByText("That password is incorrect."),
    ).toBeVisible();
  });

  test("new password fails policy — inline error on New password", async ({
    loggedInUser,
  }) => {
    const { page, user } = loggedInUser;
    const editPage = new EditProfilePage(page);

    await editPage.goto();
    await editPage.password.fill({
      current: user.password,
      next: "short",
      confirm: "short",
    });
    await editPage.password.submit();

    await expect(
      editPage.password.form.getByText(/at least 8 characters/i),
    ).toBeVisible();
  });

  test("new = current — inline error, no swap", async ({ loggedInUser }) => {
    const { page, user } = loggedInUser;
    const editPage = new EditProfilePage(page);

    await editPage.goto();
    await editPage.password.fill({
      current: user.password,
      next: user.password,
      confirm: user.password,
    });
    await editPage.password.submit();

    await expect(
      editPage.password.form.getByText(/must differ from your current password/i),
    ).toBeVisible();
  });

  test("confirm mismatch — inline error on confirm field", async ({
    loggedInUser,
  }) => {
    const { page, user } = loggedInUser;
    const editPage = new EditProfilePage(page);

    await editPage.goto();
    await editPage.password.fill({
      current: user.password,
      next: "Newp@ss-word-9",
      confirm: "Newp@ss-word-DIFFERENT",
    });
    await editPage.password.submit();

    await expect(
      editPage.password.form.getByText("Passwords don't match."),
    ).toBeVisible();
  });
});
