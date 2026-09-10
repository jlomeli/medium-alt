import { test, expect } from "@e2e/support/fixtures";
import { EditProfilePage } from "@e2e/support/pom/edit-profile.page";
import { EmailChangeConfirmPage } from "@e2e/support/pom/email-change-confirm.page";

/**
 * Pending-state journeys for `/me/edit` § Email.
 *
 * Three acceptance criteria from docs/specs/account-security.md §
 * Change email — pending state:
 *   - `Cancel change` clears the pending row.
 *   - `Resend verification` rotates the token — the previous link
 *     is no longer accepted by `/settings/email/confirm`.
 *   - Submitting a DIFFERENT new email while pending REPLACES the row
 *     (the previous token becomes invalid).
 */
const VERIFY_SUBJECT = "verify";

function extractToken(body: { Text: string; HTML: string }): string {
  const text = `${body.Text}\n${body.HTML}`;
  const match = text.match(/[?&]token=([A-Za-z0-9._-]+)/);
  if (!match) throw new Error("no verification token found in email");
  return decodeURIComponent(match[1]!);
}

test.describe("@regression @needs-mailpit change email — pending state", () => {
  // No mailpit.deleteAll() — every test targets a factory-issued
  // unique email so `waitForMessageTo(to:)` already isolates. A cross-
  // worker purge would race with parallel tests' sends.

  test("cancel clears the pending banner", async ({
    loggedInUser,
    pendingEmailChangeFactory,
  }) => {
    const { page } = loggedInUser;
    const editPage = new EditProfilePage(page);

    const { newEmail } = await pendingEmailChangeFactory.create(page.request);

    await editPage.goto();
    await expect(editPage.email.pendingBanner).toContainText(newEmail);

    await editPage.email.cancelButton.click();
    await expect(editPage.email.pendingBanner).toHaveCount(0);
  });

  test("resend rotates the token — the old link no longer confirms", async ({
    loggedInUser,
    pendingEmailChangeFactory,
    mailpit,
  }) => {
    const { page } = loggedInUser;
    const editPage = new EditProfilePage(page);
    const confirmPage = new EmailChangeConfirmPage(page);

    const { newEmail } = await pendingEmailChangeFactory.create(page.request);

    // Snapshot the original token, then trigger a resend and verify
    // the old token is now dead. We don't compare tokens directly (a
    // cross-worker mailpit purge race would flake the second fetch);
    // "old token no longer confirms" is the observable behaviour a
    // user cares about, and it can only be true if the token rotated.
    const first = await mailpit.waitForMessageTo(newEmail, {
      subjectContains: VERIFY_SUBJECT,
    });
    const oldToken = extractToken(first);

    await editPage.goto();
    await editPage.email.resendButton.click();
    await expect(
      editPage.email.form.getByText(`Verification resent to ${newEmail}.`),
    ).toBeVisible();

    // The old token no longer resolves — confirm collapses to the
    // generic invalid message.
    await confirmPage.gotoWithToken(oldToken);
    await confirmPage.confirm();
    await expect(confirmPage.invalidAlert).toBeVisible();
  });

  test("submitting a different email replaces the pending row", async ({
    loggedInUser,
    pendingEmailChangeFactory,
    mailpit,
  }) => {
    const { page } = loggedInUser;
    const editPage = new EditProfilePage(page);
    const confirmPage = new EmailChangeConfirmPage(page);

    const first = await pendingEmailChangeFactory.create(page.request);
    const firstEmail = await mailpit.waitForMessageTo(first.newEmail, {
      subjectContains: VERIFY_SUBJECT,
    });
    const firstToken = extractToken(firstEmail);

    const replacementEmail = `replacement-${Date.now()}@example.test`;
    await editPage.goto();
    await editPage.email.submitNew(replacementEmail);

    // Pending banner now names the replacement address.
    await expect(editPage.email.pendingBanner).toContainText(replacementEmail);

    // The old token no longer resolves.
    await confirmPage.gotoWithToken(firstToken);
    await confirmPage.confirm();
    await expect(confirmPage.invalidAlert).toBeVisible();
  });
});
