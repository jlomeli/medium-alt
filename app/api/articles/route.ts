/**
 * POST /api/articles — see docs/specs/articles-crud.md § API surface.
 *
 * Creates a new article for the signed-in user. Slug is server-generated
 * and immutable after create. `published: true` sets `publishedAt = now()`
 * atomically; `published: false` (or omitted) leaves `publishedAt = null`.
 */
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth/config";
import { createArticleSchema } from "@/lib/validation/article";
import { slugify } from "@/lib/articles/slug";
import { articleViewSelect } from "@/lib/articles/view";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createArticleSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0]!;
    const field = (first.path[0] ?? "form") as string;
    return NextResponse.json(
      { error: { field, code: "invalid", message: first.message } },
      { status: 400 },
    );
  }

  const { title, subtitle, body: articleBody, published = false } = parsed.data;

  // Retry loop guards against the astronomically-unlikely case of an 8-hex
  // suffix collision. See docs/specs/articles-crud.md § Slug generation.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const article = await db.article.create({
        data: {
          slug: slugify(title),
          title,
          subtitle: subtitle && subtitle.length > 0 ? subtitle : null,
          body: articleBody,
          published,
          publishedAt: published ? new Date() : null,
          authorId: session.user.id,
        },
        select: articleViewSelect,
      });
      return NextResponse.json({ article }, { status: 201 });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        ((err.meta?.target as string[] | undefined) ?? []).includes("slug")
      ) {
        continue;
      }
      throw err;
    }
  }

  // If we somehow miss three times in a row, surface a real error rather
  // than looping forever.
  return NextResponse.json(
    { error: { field: "form", code: "slug-collision" } },
    { status: 500 },
  );
}
