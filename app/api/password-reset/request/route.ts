/**
 * POST /api/password-reset/request — see docs/specs/auth.md §API surface.
 *
 * Always returns 200 { ok: true }, regardless of whether the email exists.
 * Anti-enumeration: the response, latency, and side-effects must be
 * indistinguishable from the outside.
 *
 * Timing: both branches do exactly one DB read (`findUnique`) before
 * responding. The registered-email branch's token INSERT and SMTP send both
 * happen inside `after()` so they never contribute to the wall-clock delta
 * an attacker can measure. `after()` is guaranteed to run on Vercel after
 * the response is flushed; on dev it just fires on the event loop.
 */
import { NextResponse, after } from "next/server";
import { db } from "@/lib/db";
import { generate, RESET_TOKEN_TTL_MS } from "@/lib/auth/reset-token";
import { sendEmail } from "@/lib/email/send";
import { passwordResetEmail } from "@/lib/email/templates/password-reset";
import { passwordResetRequestSchema } from "@/lib/validation/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = passwordResetRequestSchema.safeParse(body);

  // Even malformed input returns 200 — we don't leak "your email format is wrong"
  // as a distinguishable response. Silent no-op.
  if (!parsed.success) return NextResponse.json({ ok: true });

  const { email } = parsed.data;
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });

  if (user) {
    const userId = user.id;
    // Prefer per-deployment Vercel URL over any pinned env var so preview
    // deploys email preview URLs (not a stale production alias). Same reason
    // Auth.js has trustHost: true — the pinned URL was routing traffic to a
    // deployment that may not exist yet.
    const appUrl = process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : (process.env.NEXT_PUBLIC_APP_URL ??
        process.env.AUTH_URL ??
        "http://localhost:3000");

    after(async () => {
      try {
        const { raw, hash } = generate();
        await db.passwordResetToken.create({
          data: {
            tokenHash: hash,
            userId,
            expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
          },
        });
        const link = `${appUrl}/password-reset/confirm?token=${raw}`;
        await sendEmail({ to: email, ...passwordResetEmail(link) });
      } catch (err) {
        // Silent — a broken SMTP relay or DB write must not surface any
        // distinguishable signal to the client. Logged for operators.
        console.error("[password-reset] request-after failed", err);
      }
    });
  }

  return NextResponse.json({ ok: true });
}
