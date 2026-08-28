/**
 * POST /api/password-reset/request — see docs/specs/auth.md §API surface.
 *
 * Always returns 200 { ok: true }, regardless of whether the email exists.
 * Anti-enumeration: the response, latency, and side-effects must be
 * indistinguishable from the outside.
 *
 * Timing: the SMTP send happens in `after()` so both the registered and
 * unknown-email paths return after roughly one DB round-trip. The remaining
 * delta (one INSERT vs. none) is small relative to network jitter; if we
 * ever need to close it further, we can add a fake write on the miss path.
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
    const { raw, hash } = generate();
    await db.passwordResetToken.create({
      data: {
        tokenHash: hash,
        userId: user.id,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });

    const appUrl =
      process.env.NEXT_PUBLIC_APP_URL ?? process.env.AUTH_URL ?? "http://localhost:3000";
    const link = `${appUrl}/password-reset/confirm?token=${raw}`;

    // Deferred so the response returns before the SMTP round-trip. Runs after
    // the response is flushed; on Vercel this is on the same invocation, on
    // dev it just fires-and-forgets on the event loop.
    after(async () => {
      try {
        await sendEmail({ to: email, ...passwordResetEmail(link) });
      } catch (err) {
        // Silent — we don't want a broken SMTP relay to signal anything back
        // to the client. Logged for operators.
        console.error("[password-reset] sendEmail failed", err);
      }
    });
  }

  return NextResponse.json({ ok: true });
}
