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

  // Cache the hashed token — used as both the lookup key AND the
  // atomic-claim predicate below so a rotation between find and delete
  // (concurrent /resend or a fresh /request) cannot silently consume
  // the fresh row with stale-token authorization.
  const tokenHash = hashToken(parsed.data.token);

  const row = await db.pendingEmailChange.findUnique({
    where: { tokenHash },
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
      // Atomic claim: gate on BOTH `id` and `tokenHash` so a
      // concurrent /resend that rotated `tokenHash` on the same row
      // (id unchanged, upsert-in-place) cannot be consumed with the
      // stale token we authorized against. `deleteMany.count === 0`
      // means either the row was deleted OR the token rotated — same
      // generic invalid response either way.
      const claim = await tx.pendingEmailChange.deleteMany({
        where: { id: row.id, tokenHash },
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
      //
      // Same token-hash predicate as the inner claim: if the row was
      // rotated between our find and this cleanup, the rotated row
      // belongs to a fresh request the user just made — don't reap it.
      await db.pendingEmailChange.deleteMany({
        where: { id: row.id, tokenHash },
      });
      return NextResponse.json(
        { error: { field: "email", code: "in-use" } },
        { status: 409 },
      );
    }
    throw err;
  }
}
