/**
 * POST /api/me/email/confirm — see docs/specs/account-security.md § API
 * surface.
 *
 * Public endpoint (no session required — the token IS the
 * authorization, same shape as `POST /api/password-reset/confirm`).
 *
 * Response taxonomy:
 *   - 200 { email }             — happy path; User.email swapped, pending row deleted
 *   - 400 { error: token/invalid } — malformed, expired, reused, or unknown token
 *   - 409 { error: email/in-use }  — the target address was claimed by another account between request and confirm
 */
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { hash as hashToken } from "@/lib/auth/reset-token";
import { confirmEmailChangeSchema } from "@/lib/validation/account";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = confirmEmailChangeSchema.safeParse(body);
  if (!parsed.success) {
    // Malformed token — collapse to the same generic shape as an
    // unknown token so a scraper can't tell "token doesn't parse" from
    // "token isn't in the DB."
    return NextResponse.json(
      { error: { field: "token", code: "invalid" } },
      { status: 400 },
    );
  }

  const row = await db.pendingEmailChange.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
    select: { id: true, userId: true, newEmail: true, expiresAt: true },
  });

  if (!row) {
    // Unknown or already-consumed — same shape either way. Stale +
    // reused collapse to one message; the spec's confirm-page UI
    // renders "This link is no longer valid" for this branch.
    return NextResponse.json(
      { error: { field: "token", code: "invalid" } },
      { status: 400 },
    );
  }

  if (row.expiresAt < new Date()) {
    return NextResponse.json(
      { error: { field: "token", code: "invalid" } },
      { status: 400 },
    );
  }

  // Swap + delete inside one transaction so a mid-flight failure can't
  // leave User.email swapped while the pending row (with its still-
  // consumable token) still exists. See spec § Delivery ordering — the
  // same commit-then-swap rule applies in reverse here.
  try {
    const swapped = await db.$transaction(async (tx) => {
      // Atomic claim: delete-by-id guards the "two concurrent confirms
      // with the same token" race. If a competing request already
      // deleted the row, `deleteMany.count === 0` and we bail out with
      // the generic invalid response.
      const claim = await tx.pendingEmailChange.deleteMany({
        where: { id: row.id },
      });
      if (claim.count !== 1) return null;

      const user = await tx.user.update({
        where: { id: row.userId },
        data: { email: row.newEmail },
        select: { email: true },
      });
      return { email: user.email };
    });

    if (!swapped) {
      return NextResponse.json(
        { error: { field: "token", code: "invalid" } },
        { status: 400 },
      );
    }
    return NextResponse.json({ email: swapped.email });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002" &&
      ((err.meta?.target as string[] | undefined) ?? []).includes("email")
    ) {
      // The target email was claimed by another account since the
      // verification was sent. The inner `deleteMany` rolled back with
      // the transaction, so the pending row is still in the DB — but
      // resending or reusing the token can never succeed (the target
      // address will always collide). Delete the row outside the tx so
      // /me/edit clears the pending banner and the user is prompted
      // for a different address.
      await db.pendingEmailChange.deleteMany({ where: { id: row.id } });
      return NextResponse.json(
        { error: { field: "email", code: "in-use" } },
        { status: 409 },
      );
    }
    throw err;
  }
}
