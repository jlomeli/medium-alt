import { test, expect } from "@e2e/support/fixtures";
import { createLoggedInApi } from "@e2e/support/loginAs";

/**
 * HTTP contract for POST / DELETE `/api/articles/{slug}/claps` — see
 * docs/specs/claps.md § API contract.
 */

test.describe("@smoke @api @regression claps endpoints", () => {
  test("POST — 201 on first clap, 200 on subsequent", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
  }) => {
    // Author is a separate user so the viewer (loggedInPage) isn't
    // self-clapping.
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });

    const first = await loggedInPage.request.post(
      `/api/articles/${article.slug}/claps`,
    );
    expect(first.status()).toBe(201);
    const firstBody = (await first.json()) as {
      viewerCount: number;
      totalCount: number;
    };
    expect(firstBody.viewerCount).toBe(1);
    expect(firstBody.totalCount).toBe(1);

    const second = await loggedInPage.request.post(
      `/api/articles/${article.slug}/claps`,
    );
    expect(second.status()).toBe(200);
    const secondBody = (await second.json()) as {
      viewerCount: number;
      totalCount: number;
    };
    expect(secondBody.viewerCount).toBe(2);
    expect(secondBody.totalCount).toBe(2);

    await author.context.close();
  });

  test("POST with { delta: N } — batches up to the cap", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });

    // First: 30 claps in one call.
    const bulk = await loggedInPage.request.post(
      `/api/articles/${article.slug}/claps`,
      { data: { delta: 30 } },
    );
    expect(bulk.status()).toBe(201);
    const bulkBody = (await bulk.json()) as {
      viewerCount: number;
      totalCount: number;
    };
    expect(bulkBody.viewerCount).toBe(30);
    expect(bulkBody.totalCount).toBe(30);

    // Second: request 40 more; cap intervenes at 50. The response
    // reflects the actual applied delta (20), not the requested one.
    const overflow = await loggedInPage.request.post(
      `/api/articles/${article.slug}/claps`,
      { data: { delta: 40 } },
    );
    expect(overflow.status()).toBe(200);
    const overflowBody = (await overflow.json()) as {
      viewerCount: number;
      totalCount: number;
    };
    expect(overflowBody.viewerCount).toBe(50);
    expect(overflowBody.totalCount).toBe(50);

    // Third: any further POST at the cap is a 200 no-op — the counts
    // don't budge.
    const noop = await loggedInPage.request.post(
      `/api/articles/${article.slug}/claps`,
      { data: { delta: 5 } },
    );
    expect(noop.status()).toBe(200);
    const noopBody = (await noop.json()) as {
      viewerCount: number;
      totalCount: number;
    };
    expect(noopBody.viewerCount).toBe(50);
    expect(noopBody.totalCount).toBe(50);

    await author.context.close();
  });

  test("POST — self-clap returns 400 self-clap", async ({
    loggedInPage,
    articleFactory,
  }) => {
    // The viewer is the author of this article — self-clap forbidden.
    const own = await articleFactory.create(loggedInPage.request, {
      published: true,
    });
    const res = await loggedInPage.request.post(
      `/api/articles/${own.slug}/claps`,
    );
    expect(res.status()).toBe(400);
    const body = (await res.json()) as {
      error: { field: string; code: string };
    };
    expect(body.error.field).toBe("slug");
    expect(body.error.code).toBe("self-clap");
  });

  test("POST — unknown slug 404", async ({ loggedInPage }) => {
    const res = await loggedInPage.request.post(
      `/api/articles/definitely-not-a-slug-9x8y7z/claps`,
    );
    expect(res.status()).toBe(404);
  });

  test("POST — author on own draft is 400 self-clap (not 404)", async ({
    loggedInPage,
    articleFactory,
  }) => {
    // Precedence rule from docs/specs/claps.md § API contract: the
    // route resolves the article for the caller first (which does NOT
    // 404 own drafts), then checks self-clap. So an author POSTing to
    // their own unpublished article gets the more-specific 400, not
    // 404. Regression-guards a route rewrite that reorders the two
    // checks and silently flips the response code.
    const ownDraft = await articleFactory.create(loggedInPage.request, {
      published: false,
    });
    const res = await loggedInPage.request.post(
      `/api/articles/${ownDraft.slug}/claps`,
    );
    expect(res.status()).toBe(400);
    const body = (await res.json()) as {
      error: { field: string; code: string };
    };
    expect(body.error.field).toBe("slug");
    expect(body.error.code).toBe("self-clap");
  });

  test("POST — draft owned by someone else is a 404 (no leak)", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    // Draft — not published. The viewer isn't the author, so the
    // article looks like "does not exist" from the outside.
    const draft = await articleFactory.create(author.api, {
      published: false,
    });
    const res = await loggedInPage.request.post(
      `/api/articles/${draft.slug}/claps`,
    );
    expect(res.status()).toBe(404);
    await author.context.close();
  });

  test("POST — anonymous 401", async ({
    browser,
    baseURL,
    api,
    articleFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });
    const res = await api.post(`/api/articles/${article.slug}/claps`);
    expect(res.status()).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("unauthenticated");
    await author.context.close();
  });

  test.describe("POST — delta out-of-range → 400 delta", () => {
    for (const delta of [0, -3, 51, 999, 1.5]) {
      test(`delta=${delta}`, async ({
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
          `/api/articles/${article.slug}/claps`,
          { data: { delta } },
        );
        expect(res.status()).toBe(400);
        const body = (await res.json()) as {
          error: { field: string; code: string };
        };
        expect(body.error.field).toBe("delta");
        expect(body.error.code).toBe("out-of-range");
        await author.context.close();
      });
    }
  });

  test("DELETE — 204 whether or not a row existed (idempotent)", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });

    // No row yet → still 204.
    const emptyDelete = await loggedInPage.request.delete(
      `/api/articles/${article.slug}/claps`,
    );
    expect(emptyDelete.status()).toBe(204);

    // Clap, then delete twice.
    await loggedInPage.request.post(`/api/articles/${article.slug}/claps`);
    const first = await loggedInPage.request.delete(
      `/api/articles/${article.slug}/claps`,
    );
    expect(first.status()).toBe(204);
    const second = await loggedInPage.request.delete(
      `/api/articles/${article.slug}/claps`,
    );
    expect(second.status()).toBe(204);

    await author.context.close();
  });

  test("DELETE — unknown slug 404", async ({ loggedInPage }) => {
    const res = await loggedInPage.request.delete(
      `/api/articles/definitely-not-a-slug-9x8y7z/claps`,
    );
    expect(res.status()).toBe(404);
  });

  test("DELETE — anonymous 401", async ({
    browser,
    baseURL,
    api,
    articleFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });
    const res = await api.delete(`/api/articles/${article.slug}/claps`);
    expect(res.status()).toBe(401);
    await author.context.close();
  });

  test("concurrent POSTs stay idempotent (no P2002 leak)", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
  }) => {
    // Regression: two overlapping POSTs from the same viewer must
    // both resolve with a contracted 200/201, not a 500 from the
    // composite-PK race. Same design as follow's concurrent test.
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });

    const results = await Promise.all([
      loggedInPage.request.post(`/api/articles/${article.slug}/claps`),
      loggedInPage.request.post(`/api/articles/${article.slug}/claps`),
    ]);
    for (const r of results) {
      expect([200, 201]).toContain(r.status());
      const body = (await r.json()) as {
        viewerCount: number;
        totalCount: number;
      };
      expect(body.viewerCount).toBeGreaterThanOrEqual(1);
      expect(body.viewerCount).toBeLessThanOrEqual(2);
    }
    // After both settle, the final row state is viewerCount=2 —
    // asserted via a follow-up GET on the article.
    const view = await loggedInPage.request.get(
      `/api/articles/${article.slug}`,
    );
    const viewBody = (await view.json()) as {
      article: { clapCount: number; viewer?: { clapCount: number } };
    };
    expect(viewBody.article.clapCount).toBe(2);
    expect(viewBody.article.viewer?.clapCount).toBe(2);

    await author.context.close();
  });
});
