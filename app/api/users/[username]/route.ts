/**
 * GET /api/users/{username} — public profile.
 *
 * Deliberately narrow response shape: `username`, `name`, `bio`. Never
 * `email`, never `id`. Any future addition must be reviewed against the
 * "public data only" acceptance criterion in docs/specs/profile.md.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  const user = await db.user.findUnique({
    where: { username },
    select: { username: true, name: true, bio: true },
  });
  if (!user) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
  return NextResponse.json(user);
}
