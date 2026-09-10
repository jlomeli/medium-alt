/**
 * POST /api/me/email/resend — see docs/specs/account-security.md § API
 * surface. Re-issues a fresh 1-hour token for the caller's pending row,
 * invalidates the previous one, and re-dispatches to the same pending
 * address. 204 on success, 404 `no-pending` when no row exists (the UI
 * only surfaces the button when a row is present; the 404 is
 * defense-in-depth against tab-race cancellation).
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth/config";
import { issueEmailVerification } from "@/lib/auth/email-change";

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: { code: "unauthenticated" } },
      { status: 401 },
    );
  }

  const pending = await db.pendingEmailChange.findUnique({
    where: { userId: session.user.id },
    select: { newEmail: true },
  });
  if (!pending) {
    return NextResponse.json(
      { error: { code: "no-pending" } },
      { status: 404 },
    );
  }

  await issueEmailVerification(session.user.id, pending.newEmail);
  return new NextResponse(null, { status: 204 });
}
