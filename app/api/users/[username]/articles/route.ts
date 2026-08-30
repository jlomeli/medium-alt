/**
 * GET /api/users/{username}/articles — public author listing.
 *
 * Published-only, narrow shape (no `body`, no `authorId`, no `author`).
 * Same code path as the on-page render at `/profiles/{username}` so the
 * two can't drift — see `lib/articles/service.ts`.
 */
import { NextResponse } from "next/server";
import { listPublishedArticlesByUsername } from "@/lib/articles/service";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;
  const articles = await listPublishedArticlesByUsername(username);
  if (articles === null) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
  return NextResponse.json({ articles });
}
