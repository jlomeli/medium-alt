/**
 * POST /api/me/email/cancel — see docs/specs/account-security.md § API
 * surface. Deletes the caller's pending row, if any. Idempotent 204 —
 * "no pending" is not a client error here (the UI's Cancel button is
 * only shown when a row is present, but a tab-race concurrent
 * confirm/cancel would otherwise surface a spurious 404).
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth/config";

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { error: { code: "unauthenticated" } },
      { status: 401 },
    );
  }

  // `deleteMany` is the idempotent shape — a missing row is a no-op
  // rather than a P2025. `count === 0` is not surfaced; the caller
  // treats both branches the same.
  await db.pendingEmailChange.deleteMany({
    where: { userId: session.user.id },
  });

  return new NextResponse(null, { status: 204 });
}
