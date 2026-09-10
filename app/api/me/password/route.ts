/**
 * POST /api/me/password — see docs/specs/account-security.md § API surface.
 *
 * Verifies the current password via the same argon2id helper `POST /api/login`
 * uses, rejects the "same as current" case (a soft "did you mean to rotate?"
 * — the DB would happily accept it), then rehashes and updates.
 *
 * Session preservation: the JWT is signed off `User.id`, which does not
 * change on a password rotation — no cookie clear, no forced sign-out. See
 * spec § Non-goals for the "log out other devices" deferral.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth/config";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { changePasswordSchema } from "@/lib/validation/account";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: { code: "unauthenticated" } },
      { status: 401 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0]!;
    const field = String(first.path[0] ?? "form");
    // Zod policy failures on `newPassword` collapse to `weak` — the spec's
    // error taxonomy exposes `weak | out-of-range` but the shipped
    // `passwordSchema` uses a single regex, so any policy miss surfaces as
    // `weak`. Length-only failures could be broken out to `out-of-range`
    // later if a strength meter needs the distinction.
    const code =
      field === "newPassword"
        ? "weak"
        : field === "currentPassword"
          ? "required"
          : "invalid";
    return NextResponse.json(
      { error: { field, code, message: first.message } },
      { status: 400 },
    );
  }

  const { currentPassword, newPassword } = parsed.data;

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, passwordHash: true },
  });
  if (!user?.passwordHash) {
    // Session references a user without a password hash — this is only
    // reachable in the OAuth-only edge case (`passwordHash` is nullable in
    // the schema for Auth.js compatibility). Treat as "current is
    // incorrect" — same shape a wrong-password submission would produce.
    return NextResponse.json(
      { error: { field: "currentPassword", code: "invalid" } },
      { status: 400 },
    );
  }

  const ok = await verifyPassword(user.passwordHash, currentPassword);
  if (!ok) {
    return NextResponse.json(
      { error: { field: "currentPassword", code: "invalid" } },
      { status: 400 },
    );
  }

  // Detect "same as current" AFTER verifying — otherwise a wrong-current
  // submission whose `newPassword` happens to equal the stored hash's
  // plaintext would leak "you typed the current password twice" as a
  // distinct signal from "wrong current password."
  if (currentPassword === newPassword) {
    return NextResponse.json(
      {
        error: {
          field: "newPassword",
          code: "same-as-current",
          message: "New password must differ from your current password.",
        },
      },
      { status: 400 },
    );
  }

  const passwordHash = await hashPassword(newPassword);
  // Optimistic-concurrency guard: the argon2id hash we're about to
  // overwrite must still be the one we verified against. Argon2 hashing
  // takes ~100-250ms; if a concurrent request (another device, a
  // password-reset confirm) rotated the hash inside that window, our
  // update would silently clobber the newer credential. The
  // `passwordHash` predicate makes exactly one caller win — the loser
  // surfaces the same generic "currentPassword invalid" the wrong-
  // current branch above uses. From the loser's perspective the
  // password they typed is no longer the current one, which is true.
  const claim = await db.user.updateMany({
    where: { id: user.id, passwordHash: user.passwordHash },
    data: { passwordHash },
  });
  if (claim.count !== 1) {
    return NextResponse.json(
      { error: { field: "currentPassword", code: "invalid" } },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
