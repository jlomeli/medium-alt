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

  // Atomic claim guards two races:
  //   - Concurrent submits with the same token — `usedAt: null` in WHERE
  //     lets exactly one caller succeed.
  //   - Token expiring between the pre-check above and this write —
  //     argon2 hashing takes 100-250ms; `expiresAt > now` in WHERE prevents
  //     the claim from resurrecting a token that lapsed during the hash.
  const result = await db.$transaction(async (tx) => {
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) {
      // Lost the race — used, expired, or both. Same generic response the
      // pre-checks above would have produced.
      return null;
    }

    const user = await tx.user.update({
      where: { id: row.userId },
      data: { passwordHash },
      select: { email: true },
    });

    // Invalidate any other in-flight tokens for this user.
    await tx.passwordResetToken.updateMany({
      where: { userId: row.userId, usedAt: null, id: { not: row.id } },
      data: { usedAt: new Date() },
    });

    return { email: user.email };
  });

  if (!result) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }

  // `email` is returned so the client can auto-sign-in via the Credentials
  // provider. It's the same email that hit /request, so no information leak.
  return NextResponse.json({ ok: true, email: result.email });
}
