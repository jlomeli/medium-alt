import { test, expect } from "@e2e/support/fixtures";
import { PasswordResetRequestPage } from "@e2e/support/pom/password-reset-request.page";
import { PasswordResetConfirmPage } from "@e2e/support/pom/password-reset-confirm.page";
import { LoginPage } from "@e2e/support/pom/login.page";
import { HeaderComponent } from "@e2e/support/pom/header.component";

/**
 * Acceptance criteria from docs/specs/auth.md → Password reset.
 *
 * These tests use the `mailpit` fixture. Each test purges the Mailpit inbox
 * before running so parallel workers don't cross-pollinate.
 */

const RESET_SUBJECT = "reset";

/** Pull the reset link out of the email body (works on either plain text or HTML). */
function extractResetToken(body: { Text: string; HTML: string }): string {
  const text = `${body.Text}\n${body.HTML}`;
  const match = text.match(/[?&]token=([A-Za-z0-9._-]+)/);
  if (!match) throw new Error("no reset token found in email");
  return decodeURIComponent(match[1]!);
}

test.describe("@regression password reset", () => {
  test.beforeEach(async ({ mailpit }) => {
    await mailpit.deleteAll();
  });

  test("request → email → confirm → auto-signed in", async ({ page, userFactory, mailpit }) => {
    const user = await userFactory.create();
    const requestPage = new PasswordResetRequestPage(page);
    const confirmPage = new PasswordResetConfirmPage(page);
    const header = new HeaderComponent(page);

    await requestPage.requestFor(user.email);
    await expect(requestPage.confirmationHeading).toBeVisible();

    const email = await mailpit.waitForMessageTo(user.email, {
      subjectContains: RESET_SUBJECT,
    });
    const token = extractResetToken(email);

    await confirmPage.gotoWithToken(token);
    await confirmPage.fillAndSubmit("Newp@ss-word-9");

    await expect(page).toHaveURL("/");
    await expect(header.accountMenuButton).toBeVisible();
  });

  test("unknown email — same generic response, no email sent", async ({
    page,
    userFactory,
    mailpit,
  }) => {
    const requestPage = new PasswordResetRequestPage(page);
    const bogus = userFactory.build();

    await requestPage.requestFor(bogus.email);
    await expect(requestPage.confirmationHeading).toBeVisible();

    // Give Mailpit a moment; assert no message ever arrives for this address.
    await expect(async () => {
      await mailpit.waitForMessageTo(bogus.email, { timeoutMs: 1500 });
    }).rejects.toThrow();
  });

  // Tagged @needs-test-seam because it drives `/api/test/password-reset/expire`,
  // which is off in Vercel production. Nightly regression (which targets the
  // production URL) skips this tag; PR previews and dev do not.
  test("@needs-test-seam expired reset link shows an alert and no form", async ({
    page,
    userFactory,
    mailpit,
  }) => {
    const user = await userFactory.create();
    const requestPage = new PasswordResetRequestPage(page);
    const confirmPage = new PasswordResetConfirmPage(page);

    await requestPage.requestFor(user.email);
    const email = await mailpit.waitForMessageTo(user.email, {
      subjectContains: RESET_SUBJECT,
    });
    const token = extractResetToken(email);

    // Fast-forward the token past its TTL. Implemented by the app via a test-only
    // route that adjusts a fixture's `expiresAt` — see spec Open Questions if we
    // end up preferring clock injection here.
    const res = await page.request.post("/api/test/password-reset/expire", {
      data: { token },
    });
    expect(res.ok()).toBeTruthy();

    await confirmPage.gotoWithToken(token);
    await expect(page.getByText(/(?:has expired|is invalid)/i)).toBeVisible();
    await expect(confirmPage.newPasswordField).toHaveCount(0);
  });

  test("reset link can only be used once", async ({ page, userFactory, mailpit }) => {
    const user = await userFactory.create();
    const requestPage = new PasswordResetRequestPage(page);
    const confirmPage = new PasswordResetConfirmPage(page);
    const loginPage = new LoginPage(page);
    const header = new HeaderComponent(page);

    await requestPage.requestFor(user.email);
    const email = await mailpit.waitForMessageTo(user.email, {
      subjectContains: RESET_SUBJECT,
    });
    const token = extractResetToken(email);

    await confirmPage.gotoWithToken(token);
    await confirmPage.fillAndSubmit("Newp@ss-word-9");
    await expect(header.accountMenuButton).toBeVisible();

    // Log the user back out so we can attempt to reuse the link cleanly.
    await header.logOut();
    await confirmPage.gotoWithToken(token);
    await expect(page.getByText(/(?:already been used|is invalid)/i)).toBeVisible();

    // Confirm the *new* password still works — the token consumption didn't
    // corrupt the account.
    await loginPage.loginAs({ email: user.email, password: "Newp@ss-word-9" });
    await expect(page).toHaveURL("/");
  });
});
