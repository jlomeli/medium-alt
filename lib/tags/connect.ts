/**
 * Bridge Zod-parsed tag input to the Prisma relation payload the
 * article write path needs. See docs/specs/tags-feed.md § Author-side
 * tag input.
 *
 * Split out from `slug.ts` so the parsing helper stays pure (no `db`
 * import, safe to use client-side for the editor preview).
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import type { ParsedTag } from "@/lib/tags/slug";

/**
 * Upsert `Tag` rows for the given parsed input and return a Prisma
 * `set` payload that replaces the article's tags with exactly this
 * list.
 *
 * `set: []` (empty input) clears the join. Callers pass the return
 * value straight into `article.create({ data: { tags: … } })` or the
 * equivalent update.
 *
 * The N here is bounded by `MAX_TAGS_PER_ARTICLE` (5), so the N+1
 * write is not a hot-path concern.
 *
 * ## Concurrency
 *
 * `Tag.slug` is unique. Two concurrent writers introducing the same
 * new slug will race between the initial `findUnique` and the
 * `create`, and one will lose with P2002. Handled explicitly: on
 * P2002 we re-run `findUnique` and adopt the row the winner just
 * inserted. Prisma's built-in `upsert` has the same TOCTOU window
 * against the DB (SELECT-then-INSERT), which is why we don't use it
 * here — this loop is the fix.
 */
export async function tagConnectPayload(
  db: PrismaClient,
  tags: readonly ParsedTag[],
): Promise<{ set: Array<{ id: string }> }> {
  if (tags.length === 0) return { set: [] };
  const ids = await Promise.all(tags.map((tag) => resolveTagId(db, tag)));
  return { set: ids };
}

async function resolveTagId(
  db: PrismaClient,
  tag: ParsedTag,
): Promise<{ id: string }> {
  const existing = await db.tag.findUnique({
    where: { slug: tag.slug },
    select: { id: true },
  });
  if (existing) return { id: existing.id };

  try {
    const created = await db.tag.create({
      data: { slug: tag.slug, name: tag.name },
      select: { id: true },
    });
    return { id: created.id };
  } catch (err) {
    // Concurrent writer inserted the same slug between our findUnique
    // and create. Fall back to whatever the winner wrote — their
    // `name` wins the display casing race, per spec § Tag normalisation
    // "first writer wins."
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002"
    ) {
      const row = await db.tag.findUnique({
        where: { slug: tag.slug },
        select: { id: true },
      });
      if (row) return { id: row.id };
    }
    throw err;
  }
}
