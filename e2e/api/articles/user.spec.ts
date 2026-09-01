import { test, expect } from "@e2e/support/fixtures";

/** Public author-listing endpoint — docs/specs/articles-crud.md. */

test.describe("@smoke @api api/users/{username}/articles", () => {
  test("returns only published articles for a known user", async ({
    api,
    loggedInPage,
    userFactory,
    articleFactory,
  }) => {
    // The loggedInPage user's identity — fetch via /api/me.
    const meRes = await loggedInPage.request.get("/api/me");
    const me = (await meRes.json()) as { username: string };

    const draft = await articleFactory.create(loggedInPage.request, { published: false });
    const published = await articleFactory.create(loggedInPage.request, { published: true });

    const res = await api.get(`/api/users/${me.username}/articles`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      articles: Array<{ slug: string; title: string; publishedAt: string | null }>;
    };
    const slugs = body.articles.map((a) => a.slug);
    expect(slugs).toContain(published.slug);
    expect(slugs).not.toContain(draft.slug);

    // Response shape narrow — no body, no authorId. `author` and
    // `tags` are additive slice-5 fields on `PublicArticleSummary`
    // (see docs/specs/tags-feed.md § PublicArticleSummary — extension);
    // the older "no author" assertion inverted here as of that slice.
    for (const article of body.articles) {
      expect(article).not.toHaveProperty("body");
      expect(article).not.toHaveProperty("authorId");
      expect(article).toHaveProperty("author");
      expect(article).toHaveProperty("tags");
    }

    // Sanity — userFactory dependency chain is exercised.
    expect(userFactory).toBeDefined();
  });

  test("unknown username returns 404 (not empty 200)", async ({ api }) => {
    const res = await api.get("/api/users/definitely-not-a-real-user-9x8y7z/articles");
    expect(res.status()).toBe(404);
  });

  test("empty array is valid for a user with no published articles", async ({
    api,
    userFactory,
  }) => {
    // Fresh user, never wrote anything.
    const user = await userFactory.create();
    const res = await api.get(`/api/users/${user.username}/articles`);
    expect(res.status()).toBe(200);
    expect((await res.json()) as { articles: unknown[] }).toEqual({ articles: [] });
  });
});
