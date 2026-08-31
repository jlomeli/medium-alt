import { test, expect } from "@e2e/support/fixtures";

/** HTTP contract for the 4 CRUD endpoints — docs/specs/articles-crud.md. */

test.describe("@smoke @api articles crud", () => {
  test("POST /api/articles — 401 unauthenticated", async ({ api, articleFactory }) => {
    const res = await api.post("/api/articles", { data: articleFactory.build() });
    expect(res.status()).toBe(401);
  });

  test("POST /api/articles — 201 with { article: { slug, ... } }", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const attrs = articleFactory.build({ published: true });
    const res = await loggedInPage.request.post("/api/articles", { data: attrs });
    expect(res.status()).toBe(201);
    const body = (await res.json()) as { article: { slug: string; title: string } };
    expect(body.article.title).toBe(attrs.title);
    expect(typeof body.article.slug).toBe("string");
    // Never leak authorId.
    expect(body.article).not.toHaveProperty("authorId");
  });

  test("POST /api/articles — 400 on missing title", async ({ loggedInPage, articleFactory }) => {
    const res = await loggedInPage.request.post("/api/articles", {
      data: { ...articleFactory.build(), title: "" },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()) as { error: { field: string } }).toMatchObject({
      error: { field: "title" },
    });
  });

  test("GET /api/articles/{slug} — 200 on published, 404 unknown", async ({
    api,
    loggedInPage,
    articleFactory,
  }) => {
    const article = await articleFactory.create(loggedInPage.request, { published: true });

    const good = await api.get(`/api/articles/${article.slug}`);
    expect(good.status()).toBe(200);
    const body = (await good.json()) as { article: { slug: string } };
    expect(body.article.slug).toBe(article.slug);
    expect(body.article).not.toHaveProperty("authorId");

    const bad = await api.get("/api/articles/definitely-does-not-exist-9x8y");
    expect(bad.status()).toBe(404);
  });

  test("GET /api/articles/{slug} — draft visible to author, 404 to public", async ({
    api,
    loggedInPage,
    articleFactory,
  }) => {
    const article = await articleFactory.create(loggedInPage.request, { published: false });

    const own = await loggedInPage.request.get(`/api/articles/${article.slug}`);
    expect(own.status()).toBe(200);

    const public_ = await api.get(`/api/articles/${article.slug}`);
    expect(public_.status()).toBe(404);
  });

  test("PATCH /api/articles/{slug} — author update", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const article = await articleFactory.create(loggedInPage.request);
    const res = await loggedInPage.request.patch(`/api/articles/${article.slug}`, {
      data: { title: "Renamed" },
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { article: { title: string } };
    expect(body.article.title).toBe("Renamed");
  });

  test("PATCH /api/articles/{slug} — 404 to non-author (not 403)", async ({
    loggedInPage,
    articleFactory,
    userFactory,
    page,
  }) => {
    const article = await articleFactory.create(loggedInPage.request);

    const stranger = await userFactory.create();
    const login = await page.request.post("/api/login", {
      data: { email: stranger.email, password: stranger.password },
    });
    expect(login.status()).toBe(200);

    const res = await page.request.patch(`/api/articles/${article.slug}`, {
      data: { title: "Hijack" },
    });
    expect(res.status()).toBe(404);
  });

  test("PATCH /api/articles/{slug} — 401 unauthenticated", async ({
    api,
    loggedInPage,
    articleFactory,
  }) => {
    const article = await articleFactory.create(loggedInPage.request);
    const res = await api.patch(`/api/articles/${article.slug}`, { data: { title: "Hijack" } });
    expect(res.status()).toBe(401);
  });

  test("DELETE /api/articles/{slug} — author 204, unknown / non-author 404, unauth 401", async ({
    api,
    loggedInPage,
    articleFactory,
    userFactory,
    page,
  }) => {
    // 401 unauthenticated
    const someArticle = await articleFactory.create(loggedInPage.request);
    expect(
      (await api.delete(`/api/articles/${someArticle.slug}`)).status(),
    ).toBe(401);

    // 404 non-author
    const stranger = await userFactory.create();
    await page.request.post("/api/login", {
      data: { email: stranger.email, password: stranger.password },
    });
    expect((await page.request.delete(`/api/articles/${someArticle.slug}`)).status()).toBe(404);

    // 204 author
    expect(
      (await loggedInPage.request.delete(`/api/articles/${someArticle.slug}`)).status(),
    ).toBe(204);

    // Follow-up author GET is now 404
    expect(
      (await loggedInPage.request.get(`/api/articles/${someArticle.slug}`)).status(),
    ).toBe(404);
  });
});
