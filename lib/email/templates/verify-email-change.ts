/**
 * Verify-new-email content sent by `POST /api/me/email` +
 * `/api/me/email/resend`. Subject contains "verify" so Mailpit-based
 * E2E tests can filter it (`subjectContains: "verify"`), matching the
 * password-reset template's "reset" convention.
 *
 * The link lands on `/settings/email/confirm?token=…` which POSTs to
 * `/api/me/email/confirm` — same shape as password-reset confirm.
 */
export function verifyEmailChangeEmail(link: string, newEmail: string) {
  const subject = "Verify your new Medium-Alt email";
  const text = [
    `You requested to change your Medium-Alt account email to ${newEmail}.`,
    "",
    "Follow this link to confirm the change:",
    link,
    "",
    "This link expires in 1 hour. If you didn't request this, you can ignore this email — your current address stays on the account until the link is used.",
  ].join("\n");
  const html = `
    <p>You requested to change your Medium-Alt account email to <strong>${newEmail}</strong>.</p>
    <p><a href="${link}">Confirm the change</a></p>
    <p>This link expires in 1 hour. If you didn't request this, you can ignore this email — your current address stays on the account until the link is used.</p>
  `;
  return { subject, text, html };
}
