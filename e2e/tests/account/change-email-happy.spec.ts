import { test, expect } from "@e2e/support/fixtures";
import { EditProfilePage } from "@e2e/support/pom/edit-profile.page";
import { EmailChangeConfirmPage } from "@e2e/support/pom/email-change-confirm.page";
import { HeaderComponent } from "@e2e/support/pom/header.component";

/**
 * Happy-path email-change round-trip — request on `/me/edit`, pull the
 * verification link out of Mailpit, confirm on `/settings/email/confirm`,
 * and assert the login identifier swapped without invalidating the
 * session. Covers docs/specs/account-security.md § Change email —
 * request and § Change email — confirm.
 */
const VERIFY_SUBJECT = "verify";

function extractVerificationToken(body: { Text: string; HTML: string }): string {
  const text = `${body.Text}\n${body.HTML}`;
  const match = text.match(/[?&]token=([A-Za-z0-9._-]+)/);
  if (!match) throw new Error("no verification token found in email");
  return decodeURIComponent(match[1]!);
}

test.describe("@smoke @needs-mailpit change email — happy path", () => {
  // No mailpit.deleteAll() — the test's `newEmail` is `Date.now()`-
  // stamped so `waitForMessageTo(to:)` already isolates against
  // cross-worker parallelism.

  test("request → email → confirm → login swapped, session preserved", async ({
    loggedInUser,
    mailpit,
  }) => {
    const { page } = loggedInUser;
    const editPage = new EditProfilePage(page);
    const confirmPage = new EmailChangeConfirmPage(page);
    const header = new HeaderComponent(page);
    const newEmail = `swapped-${Date.now()}@example.test`;

    await editPage.goto();
    await editPage.email.submitNew(newEmail);
    await expect(
      editPage.email.form.getByText(`Verification sent to ${newEmail}.`),
    ).toBeVisible();

    const message = await mailpit.waitForMessageTo(newEmail, {
      subjectContains: VERIFY_SUBJECT,
    });
    const token = extractVerificationToken(message);

    await confirmPage.gotoWithToken(token);
    await confirmPage.confirm();
    await expect(
      confirmPage.successStatus.filter({ hasText: `Email updated to ${newEmail}` }),
    ).toBeVisible();

    // Session preserved — account menu still there without a login round-trip.
    await expect(header.accountMenuButton).toBeVisible();

    // /me/edit now shows the new email as current, and the pending row is gone.
    await editPage.goto();
    await expect(page.getByText(newEmail)).toBeVisible();
    await expect(editPage.email.pendingBanner).toHaveCount(0);
  });
});
