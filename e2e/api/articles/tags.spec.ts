import { randomBytes } from "node:crypto";
import { test, expect } from "@e2e/support/fixtures";
import { plainTextToTiptap } from "@e2e/support/factories/article.factory";

/**
 * Tag-side of `POST /api/articles` and `PATCH /api/articles/{slug}` —
 * normalisation, dedup, caps, PATCH replace/clear semantics. See
 * docs/specs/tags-feed.md § Author-side tag input.
 */

function unique(prefix: string): string {
  return `${prefix}-${randomBytes(4).toString("hex")}`;
}

test.describe("@api @regression article tags — write path", () => {
  test("POST with tags → 201; response echoes sorted normalised slugs", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const attrs = articleFactory.build({ published: true });
    const [a, b] = [unique("Software Testing"), unique("QA")];
    const res = await loggedInPage.request.post("/api/articles", {
      data: {
        ...attrs,
        body: plainTextToTiptap(attrs.body),
        tags: [a, b],
      },
    });
    expect(res.status()).toBe(201);
    const body = (await res.json()) as { article: { tags: string[] } };
    // Names had capitals + spaces; slugs are lowercase kebab. Sorted
    // deterministically by the server.
    expect(body.article.tags).toHaveLength(2);
    expect(body.article.tags).toEqual([...body.article.tags].sort());
    for (const slug of body.article.tags) {
      expect(slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  test("duplicates within one submission collapse (dedup by slug)", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const attrs = articleFactory.build();
    const dupe = unique("dupe");
    const res = await loggedInPage.request.post("/api/articles", {
      data: {
        ...attrs,
        body: plainTextToTiptap(attrs.body),
        // Same slug, different casing; also a whitespace-only entry
        // to prove it's dropped rather than raising `empty`.
        tags: [dupe, dupe.toUpperCase(), "   ", dupe],
      },
    });
    expect(res.status()).toBe(201);
    const body = (await res.json()) as { article: { tags: string[] } };
    expect(body.article.tags).toEqual([dupe]);
  });

  test("over-cap tags → 400 field:tags", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const attrs = articleFactory.build();
    const res = await loggedInPage.request.post("/api/articles", {
      data: {
        ...attrs,
        body: plainTextToTiptap(attrs.body),
        tags: Array.from({ length: 6 }, (_, i) => `${unique("cap")}-${i}`),
      },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()) as { error: { field: string } }).toMatchObject({
      error: { field: "tags" },
    });
  });

  test("tag over 30 chars → 400 field:tags", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const attrs = articleFactory.build();
    const res = await loggedInPage.request.post("/api/articles", {
      data: {
        ...attrs,
        body: plainTextToTiptap(attrs.body),
        tags: ["x".repeat(31)],
      },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()) as { error: { field: string } }).toMatchObject({
      error: { field: "tags" },
    });
  });

  test("tag that normalises to empty (`---`) → 400, not silent drop", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const attrs = articleFactory.build();
    const res = await loggedInPage.request.post("/api/articles", {
      data: {
        ...attrs,
        body: plainTextToTiptap(attrs.body),
        tags: ["---"],
      },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()) as { error: { field: string } }).toMatchObject({
      error: { field: "tags" },
    });
  });

  test("reusing an existing tag joins the same row (no duplicate slug)", async ({
    loggedInPage,
    articleFactory,
    api,
  }) => {
    // Two articles, same tag, back-to-back. Query popular-tags after
    // and confirm the count is exactly 2 (would be 3+ if a duplicate
    // Tag row were being created).
    const tag = unique("shared");
    await articleFactory.create(loggedInPage.request, {
      published: true,
      tags: [tag],
    });
    await articleFactory.create(loggedInPage.request, {
      published: true,
      tags: [tag],
    });
    const res = await api.get("/api/tags?limit=50");
    const body = (await res.json()) as { tags: Array<{ slug: string; count: number }> };
    const entry = body.tags.find((t) => t.slug === tag);
    expect(entry?.count).toBe(2);
  });

  test("PATCH tags: [...] replaces the whole set", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const oldTag = unique("old");
    const newTag = unique("new");
    const article = await articleFactory.create(loggedInPage.request, {
      published: true,
      tags: [oldTag],
    });
    const res = await loggedInPage.request.patch(
      `/api/articles/${article.slug}`,
      { data: { tags: [newTag] } },
    );
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { article: { tags: string[] } };
    expect(body.article.tags).toEqual([newTag]);
  });

  test("PATCH tags: [] clears the tag set", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const article = await articleFactory.create(loggedInPage.request, {
      published: true,
      tags: [unique("go-away")],
    });
    const res = await loggedInPage.request.patch(
      `/api/articles/${article.slug}`,
      { data: { tags: [] } },
    );
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { article: { tags: string[] } };
    expect(body.article.tags).toEqual([]);
  });

  test("PATCH without tags leaves tags untouched", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const keeper = unique("keeper");
    const article = await articleFactory.create(loggedInPage.request, {
      published: true,
      tags: [keeper],
    });
    // PATCH only the title.
    const res = await loggedInPage.request.patch(
      `/api/articles/${article.slug}`,
      { data: { title: "renamed but tags intact" } },
    );
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { article: { tags: string[]; title: string } };
    expect(body.article.title).toBe("renamed but tags intact");
    expect(body.article.tags).toEqual([keeper]);
  });
});
