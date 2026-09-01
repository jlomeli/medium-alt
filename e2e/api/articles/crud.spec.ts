import { test, expect } from "@e2e/support/fixtures";
import { plainTextToTiptap } from "@e2e/support/factories/article.factory";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { STUB_FORCE_DELETE_FAIL_KEY } from "@/lib/uploads/storage";

/** HTTP contract for the 4 CRUD endpoints — docs/specs/articles-crud.md. */

const STUB_UPLOAD_DIR = join(process.cwd(), "test-results", "uploads");

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
    const res = await loggedInPage.request.post("/api/articles", {
      data: { ...attrs, body: plainTextToTiptap(attrs.body) },
    });
    expect(res.status()).toBe(201);
    const body = (await res.json()) as { article: { slug: string; title: string } };
    expect(body.article.title).toBe(attrs.title);
    expect(typeof body.article.slug).toBe("string");
    // Never leak authorId.
    expect(body.article).not.toHaveProperty("authorId");
  });

  test("POST /api/articles — 400 on missing title", async ({ loggedInPage, articleFactory }) => {
    const attrs = articleFactory.build();
    const res = await loggedInPage.request.post("/api/articles", {
      data: { ...attrs, title: "", body: plainTextToTiptap(attrs.body) },
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

  test("POST /api/articles — body must be a Tiptap doc, not a string", async ({
    loggedInPage,
    articleFactory,
  }) => {
    // 4a accepted `body: string`; 4b requires `body: TiptapDoc`. Passing
    // a raw string must produce a field-scoped 400 keyed to `body`.
    const attrs = articleFactory.build();
    const res = await loggedInPage.request.post("/api/articles", {
      data: { ...attrs, body: "just a plain string" },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()) as { error: { field: string } }).toMatchObject({
      error: { field: "body" },
    });
  });

  test("POST /api/articles — rejects unknown node types", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const attrs = articleFactory.build();
    const res = await loggedInPage.request.post("/api/articles", {
      data: {
        ...attrs,
        body: {
          type: "doc",
          content: [{ type: "iframe", attrs: { src: "https://evil.example" } }],
        },
      },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()) as { error: { field: string } }).toMatchObject({
      error: { field: "body" },
    });
  });

  test("POST /api/articles — rejects javascript: link marks", async ({
    loggedInPage,
    articleFactory,
  }) => {
    // Anti-XSS: the schema whitelist blocks unsafe URL schemes on link
    // marks so the rendered HTML can't contain `href="javascript:..."`.
    const attrs = articleFactory.build();
    const res = await loggedInPage.request.post("/api/articles", {
      data: {
        ...attrs,
        body: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "click me",
                  marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
                },
              ],
            },
          ],
        },
      },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()) as { error: { field: string } }).toMatchObject({
      error: { field: "body" },
    });
  });

  test("GET /api/articles/{slug} — body is an object, not a string", async ({
    api,
    loggedInPage,
    articleFactory,
  }) => {
    const article = await articleFactory.create(loggedInPage.request, { published: true });
    const res = await api.get(`/api/articles/${article.slug}`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { article: { body: unknown } };
    expect(typeof body.article.body).toBe("object");
    expect((body.article.body as { type: string }).type).toBe("doc");
  });

  // --------- Slice 4c: cover image + delete cascade ---------

  test("POST /api/articles — cover image URL + alt echoed on GET", async ({
    loggedInPage,
    articleFactory,
    imageFactory,
  }) => {
    // Upload a real file first — the stub records it on disk, and the
    // returned URL matches the host allowlist (both real + E2E stub
    // prefixes are considered allowed under `E2E=1`).
    const png = imageFactory.tinyPng();
    const uploadRes = await loggedInPage.request.post("/api/uploadthing", {
      multipart: {
        file: { name: png.filename, mimeType: png.mime, buffer: png.buffer },
      },
    });
    expect(uploadRes.status()).toBe(200);
    const uploadBody = (await uploadRes.json()) as { files: Array<{ url: string }> };
    const url = uploadBody.files[0]!.url;

    const attrs = articleFactory.build({ published: true });
    const created = await loggedInPage.request.post("/api/articles", {
      data: {
        ...attrs,
        body: plainTextToTiptap(attrs.body),
        coverImageUrl: url,
        coverImageAlt: "a stub cover",
      },
    });
    expect(created.status()).toBe(201);
    const createdBody = (await created.json()) as {
      article: { slug: string; coverImageUrl: string | null; coverImageAlt: string | null };
    };
    expect(createdBody.article.coverImageUrl).toBe(url);
    expect(createdBody.article.coverImageAlt).toBe("a stub cover");

    const readRes = await loggedInPage.request.get(
      `/api/articles/${createdBody.article.slug}`,
    );
    expect(readRes.status()).toBe(200);
    const readBody = (await readRes.json()) as {
      article: { coverImageUrl: string | null; coverImageAlt: string | null };
    };
    expect(readBody.article.coverImageUrl).toBe(url);
    expect(readBody.article.coverImageAlt).toBe("a stub cover");
  });

  test("PATCH /api/articles/{slug} — coverImageUrl: null clears both", async ({
    loggedInPage,
    articleFactory,
    imageFactory,
  }) => {
    const png = imageFactory.tinyPng();
    const uploadRes = await loggedInPage.request.post("/api/uploadthing", {
      multipart: {
        file: { name: png.filename, mimeType: png.mime, buffer: png.buffer },
      },
    });
    const { files } = (await uploadRes.json()) as { files: Array<{ url: string }> };
    const url = files[0]!.url;

    const attrs = articleFactory.build();
    const created = await loggedInPage.request.post("/api/articles", {
      data: {
        ...attrs,
        body: plainTextToTiptap(attrs.body),
        coverImageUrl: url,
        coverImageAlt: "before clear",
      },
    });
    const createdBody = (await created.json()) as { article: { slug: string } };

    const patch = await loggedInPage.request.patch(
      `/api/articles/${createdBody.article.slug}`,
      { data: { coverImageUrl: null } },
    );
    expect(patch.status()).toBe(200);
    const patchBody = (await patch.json()) as {
      article: { coverImageUrl: string | null; coverImageAlt: string | null };
    };
    expect(patchBody.article.coverImageUrl).toBeNull();
    expect(patchBody.article.coverImageAlt).toBeNull();
  });

  test("POST /api/articles — off-host image src in body → 400", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const attrs = articleFactory.build();
    const res = await loggedInPage.request.post("/api/articles", {
      data: {
        ...attrs,
        body: {
          type: "doc",
          content: [
            {
              type: "image",
              attrs: {
                src: "https://evil.example/pixel.png",
                alt: "not on the allowlist",
              },
            },
          ],
        },
      },
    });
    expect(res.status()).toBe(400);
    expect((await res.json()) as { error: { field: string } }).toMatchObject({
      error: { field: "body" },
    });
  });

  test("DELETE cascade — cover + inline image files are removed", async ({
    loggedInPage,
    articleFactory,
    imageFactory,
  }) => {
    // Three uploads: cover + two inline body images.
    const uploads = await Promise.all(
      [imageFactory.tinyPng(), imageFactory.tinyJpeg(), imageFactory.tinyGif()].map(
        async (asset) => {
          const res = await loggedInPage.request.post("/api/uploadthing", {
            multipart: {
              file: { name: asset.filename, mimeType: asset.mime, buffer: asset.buffer },
            },
          });
          const body = (await res.json()) as { files: Array<{ url: string; key: string }> };
          return body.files[0]!;
        },
      ),
    );
    const [cover, inlineA, inlineB] = uploads;

    // Sanity: all three files exist on disk before the delete.
    for (const u of uploads) {
      expect(existsSync(join(STUB_UPLOAD_DIR, u!.key))).toBe(true);
    }

    const attrs = articleFactory.build();
    const created = await loggedInPage.request.post("/api/articles", {
      data: {
        ...attrs,
        coverImageUrl: cover!.url,
        coverImageAlt: "cover",
        body: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "one" }],
            },
            { type: "image", attrs: { src: inlineA!.url, alt: "inline-a" } },
            { type: "image", attrs: { src: inlineB!.url, alt: "inline-b" } },
          ],
        },
      },
    });
    expect(created.status()).toBe(201);
    const { article } = (await created.json()) as { article: { slug: string } };

    const del = await loggedInPage.request.delete(`/api/articles/${article.slug}`);
    expect(del.status()).toBe(204);

    // Every corresponding stub file is gone.
    for (const u of uploads) {
      expect(existsSync(join(STUB_UPLOAD_DIR, u!.key))).toBe(false);
    }
  });

  test("DELETE cascade — storage failure still returns 204", async ({
    loggedInPage,
    articleFactory,
    imageFactory,
  }) => {
    // Upload a file named after the stub's magic force-fail key so
    // (a) an Upload row exists — ownership filter lets the key pass
    // through to the cascade, and (b) the stub returns that literal
    // key, so its `deleteFiles` throws when invoked. The DELETE
    // handler catches + logs; the request must still succeed.
    const png = imageFactory.tinyPng();
    const uploadRes = await loggedInPage.request.post("/api/uploadthing", {
      multipart: {
        file: {
          name: `${STUB_FORCE_DELETE_FAIL_KEY}.png`,
          mimeType: png.mime,
          buffer: png.buffer,
        },
      },
    });
    expect(uploadRes.status()).toBe(200);
    const { files } = (await uploadRes.json()) as {
      files: Array<{ url: string; key: string }>;
    };
    expect(files[0]!.key).toBe(STUB_FORCE_DELETE_FAIL_KEY);
    const url = files[0]!.url;

    const attrs = articleFactory.build();
    const created = await loggedInPage.request.post("/api/articles", {
      data: {
        ...attrs,
        body: plainTextToTiptap(attrs.body),
        coverImageUrl: url,
        coverImageAlt: "will fail to delete",
      },
    });
    expect(created.status()).toBe(201);
    const { article } = (await created.json()) as { article: { slug: string } };

    const del = await loggedInPage.request.delete(`/api/articles/${article.slug}`);
    expect(del.status()).toBe(204);

    // Follow-up GET is 404 — the row is gone even though the
    // cascade rejected. The DB is the source of truth.
    const gone = await loggedInPage.request.get(`/api/articles/${article.slug}`);
    expect(gone.status()).toBe(404);
  });

  test("DELETE cascade — never deletes another author's uploaded files", async ({
    loggedInPage,
    articleFactory,
    imageFactory,
    userFactory,
    page,
  }) => {
    // Author A uploads a file + attaches it to their article.
    const png = imageFactory.tinyPng();
    const aUpload = await loggedInPage.request.post("/api/uploadthing", {
      multipart: {
        file: { name: png.filename, mimeType: png.mime, buffer: png.buffer },
      },
    });
    const aFiles = (await aUpload.json()) as {
      files: Array<{ url: string; key: string }>;
    };
    const { url: aUrl, key: aKey } = aFiles.files[0]!;
    await loggedInPage.request.post("/api/articles", {
      data: {
        ...articleFactory.build({ published: true }),
        body: plainTextToTiptap("A's body"),
        coverImageUrl: aUrl,
        coverImageAlt: "A's cover",
      },
    });
    expect(existsSync(join(STUB_UPLOAD_DIR, aKey))).toBe(true);

    // Author B logs in on a separate context, copies A's public URL
    // into a B-owned article (write path only enforces the URL
    // allowlist, not ownership), then deletes their article.
    const stranger = await userFactory.create();
    await page.request.post("/api/login", {
      data: { email: stranger.email, password: stranger.password },
    });
    const bAttrs = articleFactory.build({ published: false });
    const bCreated = await page.request.post("/api/articles", {
      data: {
        ...bAttrs,
        body: plainTextToTiptap(bAttrs.body),
        coverImageUrl: aUrl,
        coverImageAlt: "borrowed from A",
      },
    });
    expect(bCreated.status()).toBe(201);
    const { article: bArticle } = (await bCreated.json()) as {
      article: { slug: string };
    };

    const bDel = await page.request.delete(`/api/articles/${bArticle.slug}`);
    expect(bDel.status()).toBe(204);

    // A's file is untouched — the cascade filter dropped the key
    // because B doesn't own it.
    expect(existsSync(join(STUB_UPLOAD_DIR, aKey))).toBe(true);
  });

  test("DELETE cascade — keeps files still referenced by another of the deleter's articles", async ({
    loggedInPage,
    articleFactory,
    imageFactory,
  }) => {
    // Author uploads one image, sets it as cover on two articles they
    // own. Deleting one must NOT remove the shared file — the other
    // article's cover would break. The ownership filter alone can't
    // catch this (both articles are the deleter's), so the cascade
    // also walks remaining articles for a shared reference.
    const png = imageFactory.tinyPng();
    const uploaded = await loggedInPage.request.post("/api/uploadthing", {
      multipart: {
        file: { name: png.filename, mimeType: png.mime, buffer: png.buffer },
      },
    });
    const { files } = (await uploaded.json()) as {
      files: Array<{ url: string; key: string }>;
    };
    const { url, key } = files[0]!;

    const firstAttrs = articleFactory.build({ published: true });
    const firstRes = await loggedInPage.request.post("/api/articles", {
      data: {
        ...firstAttrs,
        body: plainTextToTiptap(firstAttrs.body),
        coverImageUrl: url,
        coverImageAlt: "shared cover",
      },
    });
    expect(firstRes.status()).toBe(201);
    const { article: firstArticle } = (await firstRes.json()) as {
      article: { slug: string };
    };

    const secondAttrs = articleFactory.build({ published: true });
    const secondRes = await loggedInPage.request.post("/api/articles", {
      data: {
        ...secondAttrs,
        body: plainTextToTiptap(secondAttrs.body),
        coverImageUrl: url,
        coverImageAlt: "shared cover",
      },
    });
    expect(secondRes.status()).toBe(201);

    // Delete the first article. The file survives because the second
    // article still references its URL.
    const del = await loggedInPage.request.delete(
      `/api/articles/${firstArticle.slug}`,
    );
    expect(del.status()).toBe(204);
    expect(existsSync(join(STUB_UPLOAD_DIR, key))).toBe(true);
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
