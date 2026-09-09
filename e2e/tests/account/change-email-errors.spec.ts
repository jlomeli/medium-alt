import { test, expect } from "@e2e/support/fixtures";
import { EmailChangeConfirmPage } from "@e2e/support/pom/email-change-confirm.page";

/**
 * Error journeys for `/settings/email/confirm?token=…`.
 *
 *   - Expired token (via `/api/test/email-change/expire`) → invalid alert.
 *   - Reused token → invalid alert (same collapsed shape).
 *   - Target email claimed by another account since request → 409
 *     `in-use` → in-use alert.
 */
const VERIFY_SUBJECT = "verify";

function extractToken(body: { Text: string; HTML: string }): string {
  const text = `${body.Text}\n${body.HTML}`;
  const match = text.match(/[?&]token=([A-Za-z0-9._-]+)/);
  if (!match) throw new Error("no verification token found in email");
  return decodeURIComponent(match[1]!);
}

test.describe("@regression @needs-mailpit change email — error branches", () => {
  // No mailpit.deleteAll() — every branch uses a factory-issued unique
  // pending address, so `waitForMessageTo(to:)` already isolates.

  test("@needs-test-seam expired link shows invalid alert", async ({
    loggedInUser,
    pendingEmailChangeFactory,
    mailpit,
  }) => {
    const { page } = loggedInUser;
    const confirmPage = new EmailChangeConfirmPage(page);

    const { newEmail } = await pendingEmailChangeFactory.create(page.request);
    const message = await mailpit.waitForMessageTo(newEmail, {
      subjectContains: VERIFY_SUBJECT,
    });
    const token = extractToken(message);

    // Advance expiresAt past now via the test-only seam — mirrors the
    // password-reset expire test.
    const expireRes = await page.request.post("/api/test/email-change/expire", {
      data: { token },
    });
    expect(expireRes.ok()).toBeTruthy();

    await confirmPage.gotoWithToken(token);
    await confirmPage.confirm();
    await expect(confirmPage.invalidAlert).toBeVisible();
  });

  test("reused link shows invalid alert", async ({
    loggedInUser,
    pendingEmailChangeFactory,
    mailpit,
  }) => {
    const { page } = loggedInUser;
    const confirmPage = new EmailChangeConfirmPage(page);

    const { newEmail } = await pendingEmailChangeFactory.create(page.request);
    const message = await mailpit.waitForMessageTo(newEmail, {
      subjectContains: VERIFY_SUBJECT,
    });
    const token = extractToken(message);

    await confirmPage.gotoWithToken(token);
    await confirmPage.confirm();
    await expect(confirmPage.successStatus).toBeVisible();

    // Second visit with the same token — the row was deleted on
    // success, so this falls through to the generic invalid response.
    await confirmPage.gotoWithToken(token);
    await confirmPage.confirm();
    await expect(confirmPage.invalidAlert).toBeVisible();
  });

  test("target email claimed after request → 409 in-use alert", async ({
    loggedInUser,
    userFactory,
    pendingEmailChangeFactory,
    mailpit,
  }) => {
    const { page } = loggedInUser;
    const confirmPage = new EmailChangeConfirmPage(page);

    // Pick a fresh address, request the change for it, then have a
    // second user register with that same address. The confirm should
    // now hit the P2002 branch → 409 in-use.
    const targetEmail = `claimed-${Date.now()}@example.test`;
    await pendingEmailChangeFactory.create(page.request, { newEmail: targetEmail });

    const message = await mailpit.waitForMessageTo(targetEmail, {
      subjectContains: VERIFY_SUBJECT,
    });
    const token = extractToken(message);

    // Registering claims the address on `User.email` — the confirm
    // swap will hit the unique-index violation.
    await userFactory.create({ email: targetEmail });

    await confirmPage.gotoWithToken(token);
    await confirmPage.confirm();
    await expect(confirmPage.inUseAlert).toBeVisible();
  });
});
