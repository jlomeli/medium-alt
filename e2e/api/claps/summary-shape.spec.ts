import { test, expect } from "@e2e/support/fixtures";
import { createLoggedInApi } from "@e2e/support/loginAs";

/**
 * `PublicArticleSummary` gained `clapCount` in slice 7 — see
 * docs/specs/claps.md § API contract (§ Additive shape changes).
 *
 * The read-page-only `viewer` block MUST NOT appear on any summary
 * (that would be per-card materialisation with zero read paths in v1).
 */

test.describe("@regression @api summary shape includes clapCount", () => {
  test("GET /api/articles — every summary carries clapCount, no viewer", async ({
    browser,
    baseURL,
    api,
    articleFactory,
    clapFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });
    // Author can't self-clap; use a fresh reader for the engagement.
    const reader = await createLoggedInApi(browser, baseURL);
    await clapFactory.create(reader.api, article.slug, { delta: 3 });

    const res = await api.get(`/api/articles?limit=50`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      items: Array<Record<string, unknown> & { slug: string; clapCount: number }>;
    };

    // Every item — not just ours — must carry `clapCount`, so the
    // shape is a contract for all callers.
    for (const item of body.items) {
      expect(typeof item.clapCount).toBe("number");
      expect(item.clapCount).toBeGreaterThanOrEqual(0);
      expect("viewer" in item).toBe(false);
    }

    // And our article specifically reflects the aggregate.
    const ours = body.items.find((i) => i.slug === article.slug);
    expect(ours).toBeDefined();
    expect(ours!.clapCount).toBe(3);

    await author.context.close();
    await reader.context.close();
  });

  test("GET /api/feed — every summary carries clapCount, no viewer", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
    followFactory,
    clapFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });
    const reader = await createLoggedInApi(browser, baseURL);
    await clapFactory.create(reader.api, article.slug, { delta: 7 });

    await followFactory.create(loggedInPage.request, author.user.username);

    const res = await loggedInPage.request.get("/api/feed");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      items: Array<Record<string, unknown> & { slug: string; clapCount: number }>;
    };
    for (const item of body.items) {
      expect(typeof item.clapCount).toBe("number");
      expect("viewer" in item).toBe(false);
    }
    const ours = body.items.find((i) => i.slug === article.slug);
    expect(ours).toBeDefined();
    expect(ours!.clapCount).toBe(7);

    await author.context.close();
    await reader.context.close();
  });

  test("GET /api/users/{username}/articles — clapCount on every summary", async ({
    browser,
    baseURL,
    api,
    articleFactory,
    clapFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });
    const reader = await createLoggedInApi(browser, baseURL);
    await clapFactory.create(reader.api, article.slug, { delta: 12 });

    const res = await api.get(`/api/users/${author.user.username}/articles`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      articles: Array<
        Record<string, unknown> & { slug: string; clapCount: number }
      >;
    };
    for (const item of body.articles) {
      expect(typeof item.clapCount).toBe("number");
      expect("viewer" in item).toBe(false);
    }
    const ours = body.articles.find((a) => a.slug === article.slug);
    expect(ours).toBeDefined();
    expect(ours!.clapCount).toBe(12);

    await author.context.close();
    await reader.context.close();
  });
});
