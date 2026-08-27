/**
 * POST /api/password-reset/confirm — see docs/specs/auth.md §API surface.
 *
 * Typed error taxonomy:
 *   - "expired"       — token exists but expiresAt is in the past
 *   - "invalid"       — token not found OR already used
 *   - "weak-password" — new password fails policy
 *
 * Success: updates hash, marks the token used, invalidates any other
 * outstanding tokens for the same user (defense-in-depth: a second in-flight
 * reset can no longer be used).
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hash as hashToken } from "@/lib/auth/reset-token";
import { hashPassword } from "@/lib/auth/password";
import { passwordResetConfirmSchema } from "@/lib/validation/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = passwordResetConfirmSchema.safeParse(body);

  if (!parsed.success) {
    const first = parsed.error.issues[0]!;
    // Any Zod failure on newPassword is a policy violation from the user's
    // perspective; token failures are handled below.
    const isPassword = first.path[0] === "newPassword";
    return NextResponse.json(
      { error: isPassword ? "weak-password" : "invalid" },
      { status: 400 },
    );
  }

  const { token, newPassword } = parsed.data;
  const row = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
  });

  if (!row || row.usedAt) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  if (row.expiresAt < new Date()) {
    return NextResponse.json({ error: "expired" }, { status: 400 });
  }

  const passwordHash = await hashPassword(newPassword);

  const [user] = await db.$transaction([
    db.user.update({
      where: { id: row.userId },
      data: { passwordHash },
      select: { email: true },
    }),
    db.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    }),
    // Invalidate any other in-flight tokens for this user.
    db.passwordResetToken.updateMany({
      where: { userId: row.userId, usedAt: null, id: { not: row.id } },
      data: { usedAt: new Date() },
    }),
  ]);

  // `email` is returned so the client can auto-sign-in via the Credentials
  // provider. It's the same email that hit /request, so no information leak.
  return NextResponse.json({ ok: true, email: user.email });
}
