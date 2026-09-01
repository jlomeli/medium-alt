import { randomBytes } from "node:crypto";
import { test, expect } from "@e2e/support/fixtures";

/**
 * HTTP contract for the global feed — see docs/specs/tags-feed.md §
 * API surface (`GET /api/articles`).
 *
 * Isolation strategy: every DB-touching test creates articles carrying
 * a per-test unique tag (`feed-<hex>`). Assertions filter by
 * `?tag=<uniq>` so seeded / concurrent test rows never pollute the
 * page under test. The same pattern is used across every test file
 * in this slice.
 */

function uniqueTag(): string {
  return `feed-${randomBytes(4).toString("hex")}`;
}

test.describe("@smoke @api feed articles", () => {
  test("GET /api/articles — 200 with items array + nextCursor field", async ({
    api,
  }) => {
    const res = await api.get("/api/articles?limit=1");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      items: unknown[];
      nextCursor: string | null;
    };
    expect(Array.isArray(body.items)).toBe(true);
    // `nextCursor` is either a non-empty string or exactly `null`.
    expect(body.nextCursor === null || typeof body.nextCursor === "string").toBe(
      true,
    );
  });

  test("?tag= filters the feed to matching articles", async ({
    api,
    loggedInPage,
    articleFactory,
  }) => {
    const tag = uniqueTag();
    const [a, b] = await Promise.all([
      articleFactory.create(loggedInPage.request, {
        published: true,
        tags: [tag],
      }),
      articleFactory.create(loggedInPage.request, {
        published: true,
        tags: [tag],
      }),
    ]);
    // Third article on the same author but WITHOUT the tag — must
    // stay off the filtered feed.
    await articleFactory.create(loggedInPage.request, { published: true });

    const res = await api.get(`/api/articles?tag=${tag}`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ slug: string; tags: string[] }>;
    };
    const slugs = body.items.map((i) => i.slug);
    expect(slugs).toContain(a.slug);
    expect(slugs).toContain(b.slug);
    for (const item of body.items) {
      expect(item.tags).toContain(tag);
    }
  });

  test("?tag=<unknown> returns 200 with empty items (not 404)", async ({
    api,
  }) => {
    const res = await api.get(`/api/articles?tag=${uniqueTag()}`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { items: unknown[]; nextCursor: null };
    expect(body.items).toEqual([]);
    expect(body.nextCursor).toBeNull();
  });

  test("drafts never appear on the global feed — even for the author", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const tag = uniqueTag();
    const draft = await articleFactory.create(loggedInPage.request, {
      published: false,
      tags: [tag],
    });
    // Query as the author to prove the filter is server-side, not
    // session-conditional. Public + authenticated calls must both hide
    // it.
    const res = await loggedInPage.request.get(`/api/articles?tag=${tag}`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { items: Array<{ slug: string }> };
    expect(body.items.map((i) => i.slug)).not.toContain(draft.slug);
  });

  test("cursor round-trip: pages are stable and non-overlapping", async ({
    api,
    loggedInPage,
    articleFactory,
  }) => {
    const tag = uniqueTag();
    // Three articles so limit=2 forces at least one nextCursor and one
    // follow-up page. Sequential (not Promise.all) so publishedAt
    // ordering is deterministic — page 1 must be the two newest, page 2
    // the oldest.
    const created: string[] = [];
    for (let i = 0; i < 3; i++) {
      const a = await articleFactory.create(loggedInPage.request, {
        published: true,
        tags: [tag],
      });
      created.push(a.slug);
    }

    const page1 = await api.get(`/api/articles?tag=${tag}&limit=2`);
    expect(page1.status()).toBe(200);
    const body1 = (await page1.json()) as {
      items: Array<{ slug: string }>;
      nextCursor: string | null;
    };
    expect(body1.items).toHaveLength(2);
    expect(body1.nextCursor).not.toBeNull();

    const page2 = await api.get(
      `/api/articles?tag=${tag}&limit=2&cursor=${encodeURIComponent(body1.nextCursor!)}`,
    );
    expect(page2.status()).toBe(200);
    const body2 = (await page2.json()) as {
      items: Array<{ slug: string }>;
      nextCursor: string | null;
    };
    expect(body2.items).toHaveLength(1);
    // "Last page" contract: shorter than limit ⇒ nextCursor is null,
    // no phantom empty follow-up page to discover.
    expect(body2.nextCursor).toBeNull();

    // No overlap between pages.
    const page1Slugs = new Set(body1.items.map((i) => i.slug));
    for (const item of body2.items) {
      expect(page1Slugs.has(item.slug)).toBe(false);
    }
    // Union of the two pages covers everything we created.
    const seen = new Set([
      ...body1.items.map((i) => i.slug),
      ...body2.items.map((i) => i.slug),
    ]);
    for (const slug of created) expect(seen.has(slug)).toBe(true);
  });

  test("invalid cursor → 400 (not 500)", async ({ api }) => {
    const res = await api.get("/api/articles?cursor=not-base64-anything");
    expect(res.status()).toBe(400);
    expect((await res.json()) as { error: { field: string } }).toMatchObject({
      error: { field: "cursor" },
    });
  });

  test("out-of-range limit → 400", async ({ api }) => {
    const res = await api.get("/api/articles?limit=999");
    expect(res.status()).toBe(400);
    expect((await res.json()) as { error: { field: string } }).toMatchObject({
      error: { field: "limit" },
    });
  });

  test("card shape includes tags, author, publishedAt; never body/authorId", async ({
    api,
    loggedInPage,
    articleFactory,
  }) => {
    const tag = uniqueTag();
    await articleFactory.create(loggedInPage.request, {
      published: true,
      tags: [tag, "TAG-with-CASE"],
    });
    const res = await api.get(`/api/articles?tag=${tag}`);
    const body = (await res.json()) as {
      items: Array<{
        slug: string;
        title: string;
        subtitle: string | null;
        publishedAt: string | null;
        tags: string[];
        author: { username: string | null; name: string | null };
        body?: unknown;
        authorId?: unknown;
      }>;
    };
    const item = body.items[0]!;
    expect(item).toHaveProperty("slug");
    expect(item).toHaveProperty("title");
    expect(item).toHaveProperty("publishedAt");
    expect(item.author).toBeDefined();
    // Second tag proves server-side normalisation is what lands on the
    // response: "TAG-with-CASE" → "tag-with-case". Array is sorted.
    expect(item.tags).toEqual([...item.tags].sort());
    expect(item.tags).toContain("tag-with-case");
    expect(item.tags).toContain(tag);
    expect(item).not.toHaveProperty("body");
    expect(item).not.toHaveProperty("authorId");
  });
});
