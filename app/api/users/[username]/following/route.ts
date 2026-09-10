/**
 * `GET /api/users/{username}/following` — list accounts the given
 * user follows. See docs/specs/follow-lists.md § API contract.
 *
 * Mirror of `/followers`: same shape, same validation, same viewer-
 * block presence rules. The DB query flips direction inside
 * `listFollowing`; the route handler is otherwise identical.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import {
  DEFAULT_FOLLOW_LIST_LIMIT,
  followListQuerySchema,
} from "@/lib/validation/follow-lists";
import { listFollowing } from "@/lib/follows/service";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ username: string }> },
) {
  const { username } = await params;

  const url = new URL(req.url);
  const raw: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) raw[k] = v;
  const parsed = followListQuerySchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0]!;
    const field = (first.path[0] ?? "query") as string;
    return NextResponse.json(
      { error: { field, code: "invalid", message: first.message } },
      { status: 400 },
    );
  }

  const session = await auth();
  const result = await listFollowing(username, {
    limit: parsed.data.limit ?? DEFAULT_FOLLOW_LIST_LIMIT,
    cursor: parsed.data.cursor,
    viewerId: session?.user?.id,
  });
  if (result === null) {
    return NextResponse.json(
      { error: { field: "username", code: "not-found" } },
      { status: 404 },
    );
  }
  return NextResponse.json(result);
}
