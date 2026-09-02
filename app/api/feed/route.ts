/**
 * `GET /api/feed` — Your Feed. See docs/specs/follow.md § API surface.
 *
 * Published articles from authors the viewer follows, newest first.
 * Same cursor + response shape as `GET /api/articles`; the two feeds
 * share `listPublishedFeed` under the hood (via `listFollowedFeed`),
 * so a client that already paginates the global feed can point at
 * this route with no code changes.
 *
 * Auth-required: anonymous → 401. Zero-follow viewer → 200 with an
 * empty items array (not 404 — same UX story as an unknown-tag
 * global filter).
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import {
  DEFAULT_FEED_LIMIT,
  feedYourQuerySchema,
} from "@/lib/validation/feed";
import { listFollowedFeed } from "@/lib/articles/service";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const url = new URL(req.url);
  const raw: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) raw[k] = v;
  const parsed = feedYourQuerySchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0]!;
    const field = (first.path[0] ?? "query") as string;
    return NextResponse.json(
      { error: { field, code: "invalid", message: first.message } },
      { status: 400 },
    );
  }

  const { items, nextCursor } = await listFollowedFeed({
    viewerId: session.user.id,
    limit: parsed.data.limit ?? DEFAULT_FEED_LIMIT,
    cursor: parsed.data.cursor,
  });
  return NextResponse.json({ items, nextCursor });
}
