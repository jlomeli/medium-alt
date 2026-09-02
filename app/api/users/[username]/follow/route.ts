/**
 * `/api/users/{username}/follow` — see docs/specs/follow.md § API surface.
 *
 *   - POST   — follow the target user. Idempotent: 201 on create,
 *              200 on repeat with a byte-identical body.
 *   - DELETE — unfollow. Idempotent: 204 whether a row existed or not.
 *
 * Both routes require a session. Unknown target → 404. Self-follow →
 * 400 `{ field: "username", code: "self-follow" }`. Anonymous → 401.
 *
 * Error shape follows the existing user/article convention:
 *   - 401 → `{ error: "unauthenticated" }` (literal string).
 *   - 404 → `{ error: "not-found" }` (literal string).
 *   - 400 → `{ error: { field, code, message? } }` (field-scoped,
 *           from slice 4a).
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth/config";
import { follow, unfollow } from "@/lib/follows/service";

async function resolveTarget(username: string) {
  return db.user.findUnique({
    where: { username },
    select: { id: true },
  });
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { username } = await params;
  const target = await resolveTarget(username);
  if (!target) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  if (target.id === session.user.id) {
    return NextResponse.json(
      { error: { field: "username", code: "self-follow" } },
      { status: 400 },
    );
  }

  const { created, followedAt } = await follow(session.user.id, target.id);
  return NextResponse.json(
    { following: true, followedAt: followedAt.toISOString() },
    // 201 the first time, 200 on the idempotent repeat — the body is
    // identical either way (spec § API contract), so a client that
    // ignores the status code still sees the same shape.
    { status: created ? 201 : 200 },
  );
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { username } = await params;
  const target = await resolveTarget(username);
  if (!target) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  // Unfollow is idempotent — no row to delete is a success, not an
  // error. Symmetric to POST's "already followed → 200 with same body".
  await unfollow(session.user.id, target.id);
  // 204 = No Content. `new Response(null, ...)` because
  // `NextResponse.json` always writes a body, which 204 forbids.
  return new NextResponse(null, { status: 204 });
}
