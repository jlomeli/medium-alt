import { test, expect } from "@e2e/support/fixtures";
import { createLoggedInApi } from "@e2e/support/loginAs";

/**
 * HTTP contract for `/api/articles/{slug}/comments[/{id}]` — see
 * docs/specs/comments.md § API surface + § Acceptance criteria § API
 * contract.
 */

test.describe("@smoke @api @regression comments endpoints", () => {
  test("GET — anonymous sees oldest-first list on a published article", async ({
    browser,
    baseURL,
    api,
    articleFactory,
    commentFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const reader = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });

    const first = await commentFactory.create(reader.api, article.slug, "one");
    const second = await commentFactory.create(reader.api, article.slug, "two");

    const res = await api.get(`/api/articles/${article.slug}/comments`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ id: string; body: string; createdAt: string; author: unknown }>;
    };
    // Oldest-first with a stable id tiebreak.
    expect(body.items.map((c) => c.id)).toEqual([first.id, second.id]);
    // Wire shape carries no `authorId` — comment.author is the public
    // sub-object only.
    for (const item of body.items) {
      expect("authorId" in item).toBe(false);
      expect(typeof item.createdAt).toBe("string");
    }

    await author.context.close();
    await reader.context.close();
  });

  test("GET — unknown slug → 404", async ({ api }) => {
    const res = await api.get(`/api/articles/does-not-exist-${Date.now()}/comments`);
    expect(res.status()).toBe(404);
  });

  test("GET — someone else's draft → 404", async ({
    browser,
    baseURL,
    api,
    articleFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const draft = await articleFactory.create(author.api, { published: false });

    const res = await api.get(`/api/articles/${draft.slug}/comments`);
    expect(res.status()).toBe(404);

    await author.context.close();
  });

  test("GET — author asking for comments on their own draft → 200 empty", async ({
    browser,
    baseURL,
    articleFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const draft = await articleFactory.create(author.api, { published: false });

    // The read side is permissive so the edit-my-draft page can render;
    // the list is empty because the write side rejects posts to drafts.
    const res = await author.api.get(`/api/articles/${draft.slug}/comments`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toEqual([]);

    await author.context.close();
  });

  test("POST — 201 on happy path, returns public Comment", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });

    const res = await loggedInPage.request.post(
      `/api/articles/${article.slug}/comments`,
      { data: { body: "hello world" } },
    );
    expect(res.status()).toBe(201);
    const body = (await res.json()) as {
      id: string;
      body: string;
      createdAt: string;
      author: { username: string | null; name: string | null; image: string | null };
    };
    expect(body.body).toBe("hello world");
    expect(typeof body.id).toBe("string");
    expect(typeof body.createdAt).toBe("string");
    expect(body.author).toBeDefined();
    expect("authorId" in body).toBe(false);

    await author.context.close();
  });

  test("POST — anonymous → 401", async ({
    browser,
    baseURL,
    api,
    articleFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });

    const res = await api.post(`/api/articles/${article.slug}/comments`, {
      data: { body: "trying anonymously" },
    });
    expect(res.status()).toBe(401);

    await author.context.close();
  });

  test("POST — empty body → 400 out-of-range", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });

    const res = await loggedInPage.request.post(
      `/api/articles/${article.slug}/comments`,
      { data: { body: "   " } },
    );
    expect(res.status()).toBe(400);
    const body = (await res.json()) as {
      error: { field: string; code: string };
    };
    expect(body.error.field).toBe("body");
    expect(body.error.code).toBe("out-of-range");

    await author.context.close();
  });

  test("POST — body over 2000 chars → 400 out-of-range", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });

    const res = await loggedInPage.request.post(
      `/api/articles/${article.slug}/comments`,
      { data: { body: "x".repeat(2001) } },
    );
    expect(res.status()).toBe(400);
    const body = (await res.json()) as {
      error: { field: string; code: string };
    };
    expect(body.error.field).toBe("body");
    expect(body.error.code).toBe("out-of-range");

    await author.context.close();
  });

  test("POST — unknown slug → 404", async ({ loggedInPage }) => {
    const res = await loggedInPage.request.post(
      `/api/articles/nope-${Date.now()}/comments`,
      { data: { body: "hi" } },
    );
    expect(res.status()).toBe(404);
  });

  test("POST — others' draft → 404", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const draft = await articleFactory.create(author.api, { published: false });

    const res = await loggedInPage.request.post(
      `/api/articles/${draft.slug}/comments`,
      { data: { body: "hi" } },
    );
    expect(res.status()).toBe(404);

    await author.context.close();
  });

  test("POST — own draft → 404 (self-comment on a draft is forbidden)", async ({
    browser,
    baseURL,
    articleFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const draft = await articleFactory.create(author.api, { published: false });

    const res = await author.api.post(
      `/api/articles/${draft.slug}/comments`,
      { data: { body: "note to self" } },
    );
    expect(res.status()).toBe(404);

    await author.context.close();
  });

  test("DELETE — comment author gets 204", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
    commentFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });

    const created = await commentFactory.create(
      loggedInPage.request,
      article.slug,
      "will delete",
    );

    const res = await loggedInPage.request.delete(
      `/api/articles/${article.slug}/comments/${created.id}`,
    );
    expect(res.status()).toBe(204);

    // Confirm it's gone from the list.
    const list = await loggedInPage.request.get(
      `/api/articles/${article.slug}/comments`,
    );
    const body = (await list.json()) as { items: Array<{ id: string }> };
    expect(body.items.map((c) => c.id)).not.toContain(created.id);

    await author.context.close();
  });

  test("DELETE — non-author of the comment → 403", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
    commentFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const commenter = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });
    const created = await commentFactory.create(
      commenter.api,
      article.slug,
      "not yours",
    );

    // loggedInPage is a third party, not the comment author nor the
    // article author. Article-author moderation is not a v1 concept —
    // even the article author gets 403 here (see the next test).
    const res = await loggedInPage.request.delete(
      `/api/articles/${article.slug}/comments/${created.id}`,
    );
    expect(res.status()).toBe(403);

    await author.context.close();
    await commenter.context.close();
  });

  test("DELETE — article author on someone else's comment → 403", async ({
    browser,
    baseURL,
    articleFactory,
    commentFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const commenter = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });
    const created = await commentFactory.create(
      commenter.api,
      article.slug,
      "not the author's to delete",
    );

    const res = await author.api.delete(
      `/api/articles/${article.slug}/comments/${created.id}`,
    );
    // Article authors do not get moderation power in v1.
    expect(res.status()).toBe(403);

    await author.context.close();
    await commenter.context.close();
  });

  test("DELETE — anonymous → 401", async ({
    browser,
    baseURL,
    api,
    articleFactory,
    commentFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const commenter = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });
    const created = await commentFactory.create(
      commenter.api,
      article.slug,
      "hi",
    );

    const res = await api.delete(
      `/api/articles/${article.slug}/comments/${created.id}`,
    );
    expect(res.status()).toBe(401);

    await author.context.close();
    await commenter.context.close();
  });

  test("DELETE — unknown comment id → 404", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });

    const res = await loggedInPage.request.delete(
      `/api/articles/${article.slug}/comments/does-not-exist`,
    );
    expect(res.status()).toBe(404);

    await author.context.close();
  });

  test("DELETE — comment id valid but slug is a different article → 404", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
    commentFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const a1 = await articleFactory.create(author.api, { published: true });
    const a2 = await articleFactory.create(author.api, { published: true });
    const created = await commentFactory.create(
      loggedInPage.request,
      a1.slug,
      "on a1",
    );

    const res = await loggedInPage.request.delete(
      `/api/articles/${a2.slug}/comments/${created.id}`,
    );
    // The comment isn't on a2 — the pairing must be validated.
    expect(res.status()).toBe(404);

    await author.context.close();
  });
});
