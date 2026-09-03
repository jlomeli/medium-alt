/**
 * `/api/articles/{slug}/comments/{commentId}` — see
 * docs/specs/comments.md § API surface.
 *
 *   - DELETE — signed-in, comment-author only. 204 on success; 401
 *              anonymous; 403 non-owner (the comment id is publicly
 *              readable via GET so 403 leaks nothing new — see
 *              § Error shape); 404 unknown id or wrong (slug,
 *              commentId) pairing.
 *
 * The article-slug is deliberately still part of the URL: a
 * `(slug, commentId)` pairing check inside `deleteComment` catches
 * misrouted deletes (a valid comment id on a different article) as
 * 404, matching the read side's shape.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import {
  deleteComment,
  CommentForbiddenError,
  CommentTargetMissingError,
} from "@/lib/comments/service";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ slug: string; commentId: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { slug, commentId } = await params;
  // Resolve the article id from the URL slug. An unknown slug alone
  // is 404 (same anti-enumeration shape). Draft visibility does NOT
  // enter here: the comment id is publicly readable via GET only for
  // *published* articles, so if we got a `commentId` a caller can
  // legitimately hold, the article was published at the time. If the
  // article was unpublished since, deleting one's own comment
  // remains fine.
  const article = await db.article.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!article) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  try {
    await deleteComment(session.user.id, article.id, commentId);
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    if (err instanceof CommentForbiddenError) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    if (err instanceof CommentTargetMissingError) {
      return NextResponse.json({ error: "not-found" }, { status: 404 });
    }
    throw err;
  }
}
