import { test, expect } from "@e2e/support/fixtures";
import { createLoggedInApi } from "@e2e/support/loginAs";

/**
 * `PublicArticleSummary` gained `commentCount` in slice 8 — see
 * docs/specs/comments.md § Additive shape changes.
 *
 * The read-page-only `viewer` block MUST NOT appear on any summary
 * (same discipline slice 7 enforced when it added `clapCount`).
 */

test.describe("@regression @api summary shape includes commentCount", () => {
  test("GET /api/articles — every summary carries commentCount, no viewer", async ({
    browser,
    baseURL,
    api,
    articleFactory,
    commentFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });
    const reader = await createLoggedInApi(browser, baseURL);
    await commentFactory.create(reader.api, article.slug, "one");
    await commentFactory.create(reader.api, article.slug, "two");

    const res = await api.get(`/api/articles?limit=50`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      items: Array<Record<string, unknown> & { slug: string; commentCount: number }>;
    };

    for (const item of body.items) {
      expect(typeof item.commentCount).toBe("number");
      expect(item.commentCount).toBeGreaterThanOrEqual(0);
      expect("viewer" in item).toBe(false);
    }

    const ours = body.items.find((i) => i.slug === article.slug);
    expect(ours).toBeDefined();
    expect(ours!.commentCount).toBe(2);

    await author.context.close();
    await reader.context.close();
  });

  test("GET /api/feed — every summary carries commentCount, no viewer", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
    followFactory,
    commentFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });
    const reader = await createLoggedInApi(browser, baseURL);
    await commentFactory.create(reader.api, article.slug, "one");

    await followFactory.create(loggedInPage.request, author.user.username);

    const res = await loggedInPage.request.get("/api/feed");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      items: Array<Record<string, unknown> & { slug: string; commentCount: number }>;
    };
    for (const item of body.items) {
      expect(typeof item.commentCount).toBe("number");
      expect("viewer" in item).toBe(false);
    }
    const ours = body.items.find((i) => i.slug === article.slug);
    expect(ours).toBeDefined();
    expect(ours!.commentCount).toBe(1);

    await author.context.close();
    await reader.context.close();
  });

  test("GET /api/users/{username}/articles — commentCount on every summary", async ({
    browser,
    baseURL,
    api,
    articleFactory,
    commentFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });
    const reader = await createLoggedInApi(browser, baseURL);
    await commentFactory.create(reader.api, article.slug, "a");
    await commentFactory.create(reader.api, article.slug, "b");
    await commentFactory.create(reader.api, article.slug, "c");

    const res = await api.get(`/api/users/${author.user.username}/articles`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      articles: Array<
        Record<string, unknown> & { slug: string; commentCount: number }
      >;
    };
    for (const item of body.articles) {
      expect(typeof item.commentCount).toBe("number");
      expect("viewer" in item).toBe(false);
    }
    const ours = body.articles.find((a) => a.slug === article.slug);
    expect(ours).toBeDefined();
    expect(ours!.commentCount).toBe(3);

    await author.context.close();
    await reader.context.close();
  });
});
