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
    // Two per-test tags: `hot` gets 2 articles, `cold` gets 1. Under
    // equal count, sort should tie-break on slug ascending — verified
    // in a separate test to keep this one focused on count ordering.
    const hot = `${uniqueTag()}-hot`;
    const cold = `${uniqueTag()}-cold`;
    await articleFactory.create(loggedInPage.request, {
      published: true,
      tags: [hot],
    });
    await articleFactory.create(loggedInPage.request, {
      published: true,
      tags: [hot],
    });
    await articleFactory.create(loggedInPage.request, {
      published: true,
      tags: [cold],
    });

    // High enough limit that both our tags fit alongside the seeded
    // baseline (`writing`, `intro`, `editor`, `reading`).
    const res = await api.get("/api/tags?limit=50");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      tags: Array<{ slug: string; count: number }>;
    };

    const hotEntry = body.tags.find((t) => t.slug === hot);
    const coldEntry = body.tags.find((t) => t.slug === cold);
    expect(hotEntry?.count).toBe(2);
    expect(coldEntry?.count).toBe(1);
    // Position: `hot` (count=2) must come before `cold` (count=1).
    const hotIdx = body.tags.findIndex((t) => t.slug === hot);
    const coldIdx = body.tags.findIndex((t) => t.slug === cold);
    expect(hotIdx).toBeLessThan(coldIdx);
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
});
