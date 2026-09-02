/**
 * `/api/articles/{slug}/claps` — see docs/specs/claps.md § API surface.
 *
 *   - POST   — add claps for the viewer. Idempotent up to the cap:
 *              201 on the first row created, 200 on any subsequent
 *              write; body is `{ viewerCount, totalCount }` in both
 *              cases. `delta` (1–50) is optional; missing body means
 *              `{ delta: 1 }`. When the cap intervenes the response
 *              still reflects the *actual* counts, not the requested
 *              delta.
 *   - DELETE — clear the viewer's clap contribution. Idempotent
 *              (204 whether or not a row existed).
 *
 * Anti-enumeration: an unknown slug and a draft the caller doesn't
 * own collapse to the same 404 — matches the "does not exist" leak
 * defense used across the rest of the write surface (see
 * `app/api/articles/[slug]/route.ts`).
 *
 * Error shapes reuse the conventions already in the API:
 *   - 401 → `{ error: "unauthenticated" }` (literal string).
 *   - 404 → `{ error: "not-found" }` (literal string).
 *   - 400 → `{ error: { field, code, message? } }` (field-scoped).
 *     New codes: `slug`/`self-clap`, `delta`/`out-of-range`.
 */
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth/config";
import { addClaps, clearClaps } from "@/lib/claps/service";
import { addClapsSchema } from "@/lib/validation/claps";

/**
 * Look up an article by slug and decide whether the caller may act on
 * it. Draft articles are visible only to their author; every other
 * caller sees 404. Matches the `GET /api/articles/{slug}` visibility
 * rule so a client can't discover draft slugs by probing this endpoint.
 */
async function resolveArticleForCaller(
  slug: string,
  callerId: string,
): Promise<{ id: string; authorId: string } | null> {
  const row = await db.article.findUnique({
    where: { slug },
    select: { id: true, authorId: true, published: true },
  });
  if (!row) return null;
  if (!row.published && row.authorId !== callerId) return null;
  return { id: row.id, authorId: row.authorId };
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Parse the body BEFORE looking up the article so a malformed
  // request pays 400 straightaway instead of doing a doomed DB
  // round-trip. Missing/empty body is normalised to `{ delta: 1 }`.
  const raw = await req.json().catch(() => null);
  const parsed = addClapsSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0]!;
    const field = (first.path[0] ?? "delta") as string;
    return NextResponse.json(
      {
        error: {
          field,
          code: "out-of-range",
          message: first.message,
        },
      },
      { status: 400 },
    );
  }
  const delta = parsed.data.delta ?? 1;

  const { slug } = await params;
  const article = await resolveArticleForCaller(slug, session.user.id);
  if (!article) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  if (article.authorId === session.user.id) {
    // Self-clap is meaningless. Reported as a field-scoped 400 so a
    // future author-side UI can attach the message to the clap
    // control. `slug` is the field the URL identifies the article by;
    // matches the `username` field on POST /follow's self-follow error.
    return NextResponse.json(
      { error: { field: "slug", code: "self-clap" } },
      { status: 400 },
    );
  }

  const result = await addClaps(session.user.id, article.id, delta);
  return NextResponse.json(
    { viewerCount: result.viewerCount, totalCount: result.totalCount },
    // 201 the first time a row lands, 200 on every subsequent write
    // (including the cap-hit no-op). Same 201/200 convention as
    // POST /follow.
    { status: result.created ? 201 : 200 },
  );
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { slug } = await params;
  const article = await resolveArticleForCaller(slug, session.user.id);
  if (!article) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  // Clear is idempotent — deleting a row that isn't there is not an
  // error. Symmetric to DELETE /follow.
  await clearClaps(session.user.id, article.id);
  return new NextResponse(null, { status: 204 });
}
