/**
 * Shared helpers for the email-change flow.
 *
 * Kept out of the route handlers so `POST /api/me/email` and
 * `POST /api/me/email/resend` share one implementation of "upsert
 * pending row, commit, then dispatch verification email" — the
 * ordering rule from docs/specs/account-security.md § Delivery
 * ordering isn't a nice-to-have, so consolidating it in one place
 * closes a class of "one endpoint reordered by accident" bugs.
 */
import { db } from "@/lib/db";
import { generate, RESET_TOKEN_TTL_MS } from "@/lib/auth/reset-token";
import { sendEmail } from "@/lib/email/send";
import { verifyEmailChangeEmail } from "@/lib/email/templates/verify-email-change";

/**
 * Prefer per-deployment `VERCEL_URL` over any pinned env var so preview
 * deploys email preview URLs, not a stale production alias. Same rationale
 * as `POST /api/password-reset/request`.
 */
export function appUrl(): string {
  return process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : (process.env.NEXT_PUBLIC_APP_URL ??
        process.env.AUTH_URL ??
        "http://localhost:3000");
}

/**
 * Upsert the pending row (rotating token + expiry), COMMIT, then
 * dispatch the verification email. Returns nothing on success; the
 * caller shapes the HTTP response.
 *
 * Delivery ordering (spec § Delivery ordering): the upsert is
 * committed BEFORE the mail dispatch. A dispatch-before-commit that
 * rolls back would leak a link the DB no longer recognises and leave
 * the user with no pending row to Cancel/Resend from. The inverse
 * (commit succeeds, dispatch fails) is recoverable via Resend, so
 * the sync-after-commit dispatch is sufficient without a full outbox.
 */
export async function issueEmailVerification(
  userId: string,
  newEmail: string,
): Promise<void> {
  const { raw, hash } = generate();
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);

  await db.pendingEmailChange.upsert({
    where: { userId },
    create: { userId, newEmail, tokenHash: hash, expiresAt },
    update: { newEmail, tokenHash: hash, expiresAt },
  });

  const link = `${appUrl()}/settings/email/confirm?token=${raw}`;
  try {
    await sendEmail({ to: newEmail, ...verifyEmailChangeEmail(link, newEmail) });
  } catch (err) {
    // Commit already landed; the pending row is visible on /me/edit so
    // the user can hit Resend. Log for operators; the caller's success
    // shape is unchanged (the spec's success indicator can render a
    // "if the email doesn't arrive, try Resend" hint independently).
    console.error("[account/email] verification dispatch failed", err);
  }
}
