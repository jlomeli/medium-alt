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
import { collectImageKeys } from "@/lib/articles/image-keys";
import { getStorage } from "@/lib/uploads/storage";
import type { TiptapDoc } from "@/lib/articles/tiptap";

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
    body?: Prisma.InputJsonValue;
    published?: boolean;
    publishedAt?: Date | null;
    coverImageUrl?: string | null;
    coverImageAlt?: string | null;
  } = {};
  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.subtitle !== undefined) {
    // Empty subtitle after edit clears the field rather than storing "".
    data.subtitle = parsed.data.subtitle.length > 0 ? parsed.data.subtitle : null;
  }
  // Zod already enforced the Tiptap doc shape; Prisma's `InputJsonValue`
  // is stricter than our loose type, so cast at the boundary.
  if (parsed.data.body !== undefined) {
    data.body = parsed.data.body as unknown as Prisma.InputJsonValue;
  }
  // Slice 4c — cover image update rules:
  // - PATCH `coverImageUrl: null` clears both fields (§ API contract:
  //   "Passing coverImageUrl: null clears both on the row").
  // - PATCH `coverImageUrl: <url>` sets the URL; alt follows the payload
  //   (undefined → leave existing alt untouched; null / "" → clear).
  // - PATCH `coverImageAlt` alone (without touching the URL) updates the
  //   alt in-place.
  if (parsed.data.coverImageUrl !== undefined) {
    data.coverImageUrl = parsed.data.coverImageUrl;
    if (parsed.data.coverImageUrl === null) {
      data.coverImageAlt = null;
    } else if (parsed.data.coverImageAlt !== undefined) {
      data.coverImageAlt =
        parsed.data.coverImageAlt && parsed.data.coverImageAlt.length > 0
          ? parsed.data.coverImageAlt
          : null;
    }
  } else if (parsed.data.coverImageAlt !== undefined) {
    data.coverImageAlt =
      parsed.data.coverImageAlt && parsed.data.coverImageAlt.length > 0
        ? parsed.data.coverImageAlt
        : null;
  }
  // Publish semantics: first publish sets publishedAt = now(); republish
  // keeps the original; unpublish clears it. See spec § Publish semantics.
  // The publishedAt write is decided under a row-level lock inside the
  // transaction below — see the SELECT … FOR UPDATE comment.
  if (parsed.data.published !== undefined) {
    data.published = parsed.data.published;
    if (!parsed.data.published) data.publishedAt = null;
  }
  const togglingPublish = parsed.data.published !== undefined;
  const wantsPublish = parsed.data.published === true;

  try {
    const updated = await db.$transaction(async (tx) => {
      if (togglingPublish) {
        // Row-lock for the read-modify-write on publishedAt. Without
        // FOR UPDATE two writers can interleave:
        //   1. republish probes publishedAt (sees T1 → no stamp needed);
        //   2. concurrent unpublish commits publishedAt = null;
        //   3. republish's main update lands `published = true` alone,
        //      leaving published=true with publishedAt=null.
        // Locking the row for the whole transaction serializes any two
        // PATCHes that touch `published`, so the stamp decision below
        // sees the committed state that the update will actually mutate.
        const rows = await tx.$queryRaw<Array<{ publishedAt: Date | null }>>`
          SELECT "publishedAt" FROM "Article" WHERE "id" = ${existing.id} FOR UPDATE
        `;
        if (rows.length === 0) {
          // Concurrent DELETE landed after our ownership lookup — surface
          // as the documented 404 via the P2025 catch below.
          throw new Prisma.PrismaClientKnownRequestError("Article gone", {
            code: "P2025",
            clientVersion: Prisma.prismaVersion.client,
          });
        }
        // First-publish stamp: only when currently null. A republish
        // (publishedAt already set) is a no-op here → the original
        // publication time is preserved.
        if (wantsPublish && rows[0]!.publishedAt === null) {
          data.publishedAt = new Date();
        }
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

  // Slice 4c — DELETE cascades cover + inline image uploads. We need
  // the row's `coverImageUrl` + `body` to compute the keys, so read +
  // delete inside a transaction (no TOCTOU: the SELECT + DELETE
  // serialize against a concurrent PATCH that would change the body).
  // The cascade itself runs AFTER the tx commits so a slow / failed
  // storage call never blocks or rolls back the DB row. See spec §
  // Delete-cascade (best-effort) and Decision 6.
  let removed: { coverImageUrl: string | null; body: unknown } | null = null;
  try {
    removed = await db.$transaction(async (tx) => {
      const row = await tx.article.findFirst({
        where: { slug, authorId: session.user.id },
        select: { id: true, coverImageUrl: true, body: true },
      });
      if (!row) return null;
      await tx.article.delete({ where: { id: row.id } });
      return { coverImageUrl: row.coverImageUrl, body: row.body };
    });
  } catch (err) {
    // Bubble unexpected errors as 500 — the row state is unknown.
    console.error("[articles.DELETE] transactional delete failed", err);
    throw err;
  }

  if (!removed) {
    // Both "row missing" and "row owned by someone else" collapse to
    // the same 404 — see the anti-enumeration note at the top of the file.
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  // Best-effort file cascade. Failures are logged with the article id
  // + intended keys so a follow-up prune can catch orphans, but the
  // request still returns 204 — the DB row is the source of truth.
  //
  // Ownership filter (§ Delete-cascade — ownership): keys derived from
  // the article's URLs are intersected with the `Upload` table scoped
  // to the deleter. Copy-pasted URLs from another author's article
  // therefore never reach `storage.deleteFiles`, so an unrelated user
  // can't nuke someone else's file by removing their own article.
  //
  // Shared-reference filter (§ Delete-cascade — shared references):
  // an owned key that another of the deleter's remaining articles
  // still references (cover URL or inline body image) is kept. Without
  // this, deleting one of two articles that share an image would nuke
  // the file and break the surviving article's cover / inline image.
  const derived = collectImageKeys({
    coverImageUrl: removed.coverImageUrl,
    body: removed.body as TiptapDoc,
  });
  if (derived.length > 0) {
    const owned = await db.upload.findMany({
      where: { key: { in: derived }, ownerId: session.user.id },
      select: { key: true },
    });
    const ownedKeys = new Set(owned.map((u) => u.key));
    if (ownedKeys.size > 0) {
      // Walk the deleter's remaining articles (the just-deleted row is
      // already gone from the tx above, so it can't shadow itself here)
      // and drop any key that's still referenced somewhere else. We
      // scope by author because ownership is per-user: only the owner's
      // own articles matter for a "still in use by me" decision.
      const others = await db.article.findMany({
        where: { authorId: session.user.id },
        select: { coverImageUrl: true, body: true },
      });
      const stillReferenced = new Set<string>();
      for (const other of others) {
        for (const key of collectImageKeys({
          coverImageUrl: other.coverImageUrl,
          body: other.body as TiptapDoc,
        })) {
          if (ownedKeys.has(key)) stillReferenced.add(key);
        }
      }
      const keys = [...ownedKeys].filter((k) => !stillReferenced.has(k));
      if (keys.length > 0) {
        try {
          await getStorage().deleteFiles(keys);
        } catch (err) {
          console.warn("[articles.DELETE] storage.deleteFiles failed", { slug, keys, err });
        }
        // Drop the Upload rows for the keys we intended to delete —
        // even if storage.deleteFiles rejects, the row is no longer
        // owned by any article we know about; a follow-up prune uses
        // the presence of Upload rows to identify orphans.
        await db.upload.deleteMany({ where: { key: { in: keys } } });
      }
    }
  }

  return new NextResponse(null, { status: 204 });
}
