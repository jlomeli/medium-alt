/**
 * `/api/articles/{slug}/comments` — see docs/specs/comments.md § API
 * surface.
 *
 *   - GET  — list oldest-first. Public for published articles; the
 *            author of a draft gets an empty list (edit-my-draft
 *            uses this path); everyone else gets 404 on a draft.
 *   - POST — signed-in only; body Zod-checked; drafts (including
 *            own drafts — self-comment on a draft is meaningless)
 *            return 404. Returns 201 + the public `Comment` shape.
 *
 * Error shapes reuse the API's conventions:
 *   - 401 → `{ error: "unauthenticated" }` (literal string).
 *   - 404 → `{ error: "not-found" }` (literal string).
 *   - 400 → `{ error: { field, code, message? } }` (field-scoped).
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { resolveArticleForCaller } from "@/lib/articles/access";
import { db } from "@/lib/db";
import {
  createComment,
  listCommentsForArticle,
  CommentTargetMissingError,
  type CommentWithAuthorship,
} from "@/lib/comments/service";
import { createCommentSchema } from "@/lib/validation/comment";

/**
 * Project the internal `CommentWithAuthorship` to the public wire
 * shape. Stringify `createdAt` (Prisma hands us a `Date`) and drop
 * `authorId` — see docs/specs/comments.md § Response shapes. Kept
 * local rather than exported from the service because the service's
 * consumers (RSC + server action) want the native shape; only the
 * HTTP boundary strips it.
 */
function toPublicComment(row: CommentWithAuthorship) {
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    author: row.author,
  };
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  // Anonymous callers can GET a published article's comments —
  // `resolveArticleForCaller` needs a `callerId` but only uses it
  // for draft-visibility. For anonymous we pass a sentinel that
  // will never own an article; drafts collapse to 404 for them.
  const session = await auth();
  const callerId = session?.user?.id;

  // A slug we can't resolve OR one we can but it's a draft not owned
  // by the caller → 404. Same anti-enumeration shape used elsewhere.
  const row = await db.article.findUnique({
    where: { slug },
    select: { id: true, authorId: true, published: true },
  });
  if (!row) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
  if (!row.published && row.authorId !== callerId) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  // Owned draft → list is empty by construction (no write path to a
  // draft exists), so we can skip the round-trip and return [].
  if (!row.published) {
    return NextResponse.json({ items: [] });
  }

  const rows = await listCommentsForArticle(row.id);
  return NextResponse.json({ items: rows.map(toPublicComment) });
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // Parse body first so a malformed request pays 400 straightaway
  // (same discipline as the claps POST).
  const raw = await req.json().catch(() => null);
  const parsed = createCommentSchema.safeParse(raw ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0]!;
    // The `.pipe()` in the schema puts `body` at the *end* of the
    // path; normalise back to the top-level field name the wire
    // contract promises.
    const field = "body";
    return NextResponse.json(
      { error: { field, code: "out-of-range", message: first.message } },
      { status: 400 },
    );
  }

  const { slug } = await params;
  const article = await resolveArticleForCaller(slug, session.user.id);
  if (!article) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
  // Own-draft rejection — a draft has no reader audience, so a
  // comment on it is meaningless even from the author. Matches the
  // server action's step 4 (see docs/specs/comments.md § UI surface
  // / `<CommentForm>`).
  if (!article.published) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  try {
    const created = await createComment(
      session.user.id,
      article.id,
      parsed.data.body,
    );
    return NextResponse.json(toPublicComment(created), { status: 201 });
  } catch (err) {
    // Cascade race between the resolve and the insert (matches the
    // ClapTargetMissingError translation in the claps route).
    if (err instanceof CommentTargetMissingError) {
      return NextResponse.json({ error: "not-found" }, { status: 404 });
    }
    throw err;
  }
}
