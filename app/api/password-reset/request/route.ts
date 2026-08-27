/**
 * POST /api/password-reset/request — see docs/specs/auth.md §API surface.
 *
 * Always returns 200 { ok: true }, regardless of whether the email exists.
 * Anti-enumeration: the response, latency, and side-effects must be
 * indistinguishable from the outside.
 */
import { NextResponse } from "next/server";
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
    await sendEmail({ to: email, ...passwordResetEmail(link) });
  }

  return NextResponse.json({ ok: true });
}
