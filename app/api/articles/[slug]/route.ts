/**
 * GET / PATCH / DELETE /api/articles/{slug} — see
 * docs/specs/articles-crud.md § API surface.
 *
 * Anti-enumeration: PATCH and DELETE return 404 (never 403) when the
 * caller isn't the author. That matches the "does not exist" leak
 * defense used across the rest of the write surface — the caller can't
 * tell whether the slug maps to nothing or to someone else's row.
 */
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth/config";
import { updateArticleSchema } from "@/lib/validation/article";
import { articleViewSelect } from "@/lib/articles/view";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const article = await db.article.findUnique({
    where: { slug },
    // authorId only for the visibility check below; not returned in the body.
    select: { ...articleViewSelect, authorId: true },
  });
  if (!article) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  if (!article.published) {
    const session = await auth();
    if (!session?.user || session.user.id !== article.authorId) {
      return NextResponse.json({ error: "not-found" }, { status: 404 });
    }
  }

  const { authorId: _authorId, ...view } = article;
  return NextResponse.json({ article: view });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const { slug } = await params;
  const existing = await db.article.findUnique({
    where: { slug },
    select: { id: true, authorId: true },
  });
  // Both "row missing" and "row exists but different owner" collapse to
  // the same 404 — see the anti-enumeration note at the top of the file.
  if (!existing || existing.authorId !== session.user.id) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = updateArticleSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0]!;
    const field = (first.path[0] ?? "form") as string;
    return NextResponse.json(
      { error: { field, code: "invalid", message: first.message } },
      { status: 400 },
    );
  }

  const data: {
    title?: string;
    subtitle?: string | null;
    body?: string;
    published?: boolean;
    publishedAt?: Date | null;
  } = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.subtitle !== undefined) {
    // Empty subtitle after edit clears the field rather than storing "".
    data.subtitle = parsed.data.subtitle.length > 0 ? parsed.data.subtitle : null;
  }
  if (parsed.data.body !== undefined) data.body = parsed.data.body;
  // Publish semantics: first publish sets publishedAt = now(); republish
  // keeps the original; unpublish clears it. See spec § Publish semantics.
  // The first-publish stamp is applied via a conditional `updateMany` in
  // the transaction below (`where: { publishedAt: null }`) so two
  // concurrent publish requests can't both observe null, both stamp their
  // own now(), and overwrite the real first-publication time — only the
  // first-to-commit writer sets the value.
  if (parsed.data.published !== undefined) {
    data.published = parsed.data.published;
    if (!parsed.data.published) data.publishedAt = null;
  }
  const publishing = parsed.data.published === true;

  try {
    const updated = await db.$transaction(async (tx) => {
      if (publishing) {
        // Atomic first-publish stamp: only writes when publishedAt is
        // still null, so a republish is a no-op here.
        await tx.article.updateMany({
          where: { id: existing.id, publishedAt: null },
          data: { publishedAt: new Date() },
        });
      }
      return tx.article.update({
        where: { id: existing.id },
        data,
        select: articleViewSelect,
      });
    });
    return NextResponse.json({ article: updated });
  } catch (err) {
    // Concurrent DELETE landed between the ownership lookup and the
    // update — surface as 404 (the row is gone), not a 500.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2025"
    ) {
      return NextResponse.json({ error: "not-found" }, { status: 404 });
    }
    throw err;
  }
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
  // Atomic ownership check + delete via `deleteMany` — no TOCTOU window
  // between "look up authorId" and "delete row".
  const result = await db.article.deleteMany({
    where: { slug, authorId: session.user.id },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
  return new NextResponse(null, { status: 204 });
}
