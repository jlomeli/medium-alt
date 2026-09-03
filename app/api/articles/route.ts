/**
 * `/api/articles` — see docs/specs/articles-crud.md and
 * docs/specs/tags-feed.md.
 *
 *   - POST — create (auth-required). Slug is server-generated and
 *     immutable after create. `published: true` sets
 *     `publishedAt = now()` atomically. `tags` is normalised through
 *     `parseTagInput` in the Zod schema and joined via `Tag.slug`.
 *   - GET  — public global feed (slice 5). Published-only, cursor-
 *     paginated on `(publishedAt DESC, id DESC)`, filterable by `tag`.
 */
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth/config";
import { createArticleSchema } from "@/lib/validation/article";
import { slugify } from "@/lib/articles/slug";
import { articleViewSelect, shapeArticleView } from "@/lib/articles/view";
import { tagConnectPayload } from "@/lib/tags/connect";
import {
  DEFAULT_FEED_LIMIT,
  feedQuerySchema,
} from "@/lib/validation/feed";
import { listPublishedFeed } from "@/lib/articles/service";

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

  const {
    title,
    subtitle,
    body: articleBody,
    published = false,
    coverImageUrl,
    coverImageAlt,
    tags,
  } = parsed.data;

  // Upsert Tag rows first so we can pass the connect payload straight
  // into the article create. Bounded by MAX_TAGS_PER_ARTICLE (5).
  const tagsPayload = tags ? await tagConnectPayload(db, tags) : undefined;

  // Retry loop guards against the astronomically-unlikely case of an 8-hex
  // suffix collision. See docs/specs/articles-crud.md § Slug generation.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const article = await db.article.create({
        data: {
          slug: slugify(title),
          title,
          subtitle: subtitle && subtitle.length > 0 ? subtitle : null,
          // Zod already validated the doc shape (see
          // `bodySchema` / `tiptapDocSchema`); Prisma's `InputJsonValue`
          // is stricter than our loose Tiptap type, so cast at the
          // boundary.
          body: articleBody as unknown as Prisma.InputJsonValue,
          published,
          publishedAt: published ? new Date() : null,
          // Slice 4c — cover image. If the URL is cleared/omitted,
          // the alt has nothing to hang off, so clear it too. This
          // mirrors the § API surface note: "a cover-less alt is
          // inert."
          coverImageUrl: coverImageUrl ?? null,
          coverImageAlt:
            coverImageUrl && coverImageAlt && coverImageAlt.length > 0 ? coverImageAlt : null,
          authorId: session.user.id,
          ...(tagsPayload ? { tags: { connect: tagsPayload.set } } : {}),
        },
        select: articleViewSelect,
      });
      // A freshly-created article has no claps yet, and the caller
      // is always the author (who can't self-clap). Both fields land
      // as zero without touching the DB.
      return NextResponse.json(
        {
          article: shapeArticleView(article, {
            clapCount: 0,
            viewer: { clapCount: 0, hasClapped: false },
          }),
        },
        { status: 201 },
      );
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

/**
 * `GET /api/articles?tag=&cursor=&limit=` — global feed.
 *
 * Public: no session required, drafts never appear (even for the
 * author-as-caller). See docs/specs/tags-feed.md § API surface.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  // Hand the FULL query object to the schema so `.strict()` actually
  // fires on unknown keys — earlier iterations pre-filtered to the
  // known keys, which silently swallowed typos like `?limits=5`.
  const raw: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) raw[k] = v;
  const parsed = feedQuerySchema.safeParse(raw);
  if (!parsed.success) {
    const first = parsed.error.issues[0]!;
    const field = (first.path[0] ?? "query") as string;
    return NextResponse.json(
      { error: { field, code: "invalid", message: first.message } },
      { status: 400 },
    );
  }

  const { items, nextCursor } = await listPublishedFeed({
    limit: parsed.data.limit ?? DEFAULT_FEED_LIMIT,
    cursor: parsed.data.cursor,
    tag: parsed.data.tag,
  });
  return NextResponse.json({ items, nextCursor });
}
