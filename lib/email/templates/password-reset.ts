/**
 * Password-reset email content. Subject contains "reset" so Mailpit-based E2E
 * tests can filter it (`subjectContains: "reset"`).
 */
export function passwordResetEmail(link: string) {
  const subject = "Reset your Medium-Alt password";
  const text = [
    "You (or someone using your email) requested a password reset for Medium-Alt.",
    "",
    "Follow this link to set a new password:",
    link,
    "",
    "This link expires in 1 hour. If you didn't request this, you can ignore this email.",
  ].join("\n");
  const html = `
    <p>You (or someone using your email) requested a password reset for Medium-Alt.</p>
    <p><a href="${link}">Set a new password</a></p>
    <p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
  `;
  return { subject, text, html };
}
