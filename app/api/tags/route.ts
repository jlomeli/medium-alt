/**
 * `GET /api/tags?limit=` — popular tags. See docs/specs/tags-feed.md
 * § API surface.
 *
 * Public: no session required. Only tags carrying at least one
 * published article are returned; a tag whose entire article set is
 * draft never appears. Sorted by count desc, slug asc.
 */
import { NextResponse } from "next/server";
import {
  DEFAULT_TAGS_LIMIT,
  tagsQuerySchema,
} from "@/lib/validation/feed";
import { listPopularTags } from "@/lib/articles/service";

export async function GET(req: Request) {
  const url = new URL(req.url);
  // Full query object → schema; `.strict()` on `tagsQuerySchema` rejects
  // unknown keys instead of silently accepting `?limits=5` and friends.
  const raw: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) raw[k] = v;

  const parsed = tagsQuerySchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0]!;
    const field = (first.path[0] ?? "query") as string;
    return NextResponse.json(
      { error: { field, code: "invalid", message: first.message } },
      { status: 400 },
    );
  }

  const tags = await listPopularTags(parsed.data.limit ?? DEFAULT_TAGS_LIMIT);
  return NextResponse.json({ tags });
}
