/**
 * GET /api/users/{username} — public profile.
 *
 * Deliberately narrow response shape: `username`, `name`, `bio`, plus
 * the two follow counts added in slice 9 (follow-lists). Never
 * `email`, never `id`. Any future addition must be reviewed against
 * the "public data only" acceptance criterion in
 * docs/specs/profile.md.
 *
 * The counts are DB-derived per render — see
 * docs/specs/follow-lists.md § Data model delta. Two indexed
 * `count()` calls fired in parallel; no denormalised counter column.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { countFollowers, countFollowing } from "@/lib/follows/service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  const user = await db.user.findUnique({
    where: { username },
    // `id` is loaded solely to feed the two count queries below —
    // never rendered. Comparing on `id` (not `username`) keeps the
    // downstream query stable across a username rename.
    select: { id: true, username: true, name: true, bio: true },
  });
  if (!user) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
  const [followerCount, followingCount] = await Promise.all([
    countFollowers(user.id),
    countFollowing(user.id),
  ]);
  return NextResponse.json({
    username: user.username,
    name: user.name,
    bio: user.bio,
    followerCount,
    followingCount,
  });
}
