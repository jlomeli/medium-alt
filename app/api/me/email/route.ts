/**
 * POST /api/me/email — see docs/specs/account-security.md § API surface.
 *
 * Signed-in request to change the login identifier. Response is `202
 * { pending: true }` for both the happy path AND the "already in use
 * by another account" case — the same anti-enumeration shape
 * `POST /api/password-reset/request` uses. Malformed and same-as-current
 * inputs are distinguishable 400s; those aren't enumeration oracles
 * because they don't depend on other users' state.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth/config";
import { changeEmailSchema } from "@/lib/validation/account";
import { issueEmailVerification } from "@/lib/auth/email-change";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: { code: "unauthenticated" } },
      { status: 401 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = changeEmailSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0]!;
    const field = String(first.path[0] ?? "form");
    return NextResponse.json(
      { error: { field, code: "invalid", message: first.message } },
      { status: 400 },
    );
  }

  // Normalize once at the boundary — every downstream check
  // (same-as-current, anti-enumeration lookup, pending-row write,
  // eventual confirm) then compares apples to apples. Emails are
  // case-insensitive per RFC 5321 in practice for consumer providers;
  // storing a mixed-case swap-target would let "Alice@x.io" land as a
  // login identifier that a subsequent `alice@x.io` login wouldn't
  // match under Prisma's case-sensitive @unique.
  const newEmail = parsed.data.newEmail.toLowerCase();

  const me = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true },
  });
  if (!me) {
    return NextResponse.json(
      { error: { code: "unauthenticated" } },
      { status: 401 },
    );
  }

  // Same-as-current: reject with a distinguishable 400. This is not an
  // enumeration oracle — the caller already knows their own email.
  // `me.email` isn't normalized on write elsewhere in the codebase, so
  // still lowercase it here for the comparison only.
  if (newEmail === me.email.toLowerCase()) {
    return NextResponse.json(
      {
        error: {
          field: "newEmail",
          code: "same-as-current",
          message: "New email must differ from your current email.",
        },
      },
      { status: 400 },
    );
  }

  // Anti-enumeration: if the address is already in use by another
  // account, respond with the same 202 shape as the happy path. Do not
  // create a pending row and do not dispatch. The password-reset
  // request endpoint uses the same shape for the "unknown email"
  // branch — keeping this endpoint from being an oracle for "who else
  // has an account here?"
  const claimed = await db.user.findUnique({
    where: { email: newEmail },
    select: { id: true },
  });
  if (claimed && claimed.id !== me.id) {
    return NextResponse.json({ pending: true }, { status: 202 });
  }

  await issueEmailVerification(me.id, newEmail);
  return NextResponse.json({ pending: true }, { status: 202 });
}
