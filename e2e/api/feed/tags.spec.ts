import { randomBytes } from "node:crypto";
import { test, expect } from "@e2e/support/fixtures";

/**
 * `GET /api/tags` — see docs/specs/tags-feed.md § API surface.
 */

function uniqueTag(): string {
  return `tags-${randomBytes(4).toString("hex")}`;
}

test.describe("@smoke @api popular tags", () => {
  test("returns { tags: [...] } sorted by count desc, slug asc", async ({
    api,
    loggedInPage,
    articleFactory,
  }) => {
    // Bump one per-test tag's count high enough that (a) it's virtually
    // guaranteed to sit in the top-50 popular-tags response regardless
    // of DB state carried over from other tests, and (b) its count is
    // uniquely identifiable in the response.
    const tag = `${uniqueTag()}-hot`;
    for (let i = 0; i < 3; i++) {
      await articleFactory.create(loggedInPage.request, {
        published: true,
        tags: [tag],
      });
    }

    const res = await api.get("/api/tags?limit=50");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      tags: Array<{ slug: string; count: number }>;
    };

    // Count reported for our tag matches what we created — proves the
    // count filter is `published = true` scoped and dedupes correctly.
    const entry = body.tags.find((t) => t.slug === tag);
    expect(entry?.count).toBe(3);

    // Sort invariant across the WHOLE response — for every adjacent
    // pair, either count strictly decreases OR count is equal and
    // slug strictly increases. Testing the property rather than the
    // presence of a second seeded tag keeps this test robust to DB
    // drift from other test runs (a local DB with many published-tag
    // rows can push a low-count fixture off the top-50, but the
    // ordering guarantee still holds for whatever tags come back).
    for (let i = 1; i < body.tags.length; i++) {
      const prev = body.tags[i - 1]!;
      const curr = body.tags[i]!;
      const inOrder =
        prev.count > curr.count ||
        (prev.count === curr.count && prev.slug < curr.slug);
      expect(
        inOrder,
        `sort violated at index ${i}: prev=${prev.slug}(${prev.count}) curr=${curr.slug}(${curr.count})`,
      ).toBe(true);
    }
  });

  test("draft-only tags never appear in the popular-tags list", async ({
    api,
    loggedInPage,
    articleFactory,
  }) => {
    const draftTag = uniqueTag();
    await articleFactory.create(loggedInPage.request, {
      published: false,
      tags: [draftTag],
    });
    const res = await api.get("/api/tags?limit=50");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { tags: Array<{ slug: string }> };
    expect(body.tags.map((t) => t.slug)).not.toContain(draftTag);
  });

  test("?limit=<n> caps the returned list", async ({ api }) => {
    const res = await api.get("/api/tags?limit=1");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { tags: unknown[] };
    expect(body.tags.length).toBeLessThanOrEqual(1);
  });

  test("?limit=999 → 400 (out of range)", async ({ api }) => {
    const res = await api.get("/api/tags?limit=999");
    expect(res.status()).toBe(400);
    expect((await res.json()) as { error: { field: string } }).toMatchObject({
      error: { field: "limit" },
    });
  });

  test("malformed limit (`5abc`) → 400, not silent truncation", async ({ api }) => {
    const res = await api.get("/api/tags?limit=5abc");
    expect(res.status()).toBe(400);
    expect((await res.json()) as { error: { field: string } }).toMatchObject({
      error: { field: "limit" },
    });
  });

  test("unknown query key (?limits=5) → 400 via strict schema", async ({ api }) => {
    const res = await api.get("/api/tags?limits=5");
    expect(res.status()).toBe(400);
  });
});
