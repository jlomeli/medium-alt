import { test, expect } from "@e2e/support/fixtures";
import { createLoggedInApi } from "@e2e/support/loginAs";

/**
 * `GET /api/articles/{slug}` shape assertions for the claps additions —
 * see docs/specs/claps.md § API contract (§ Additive shape changes).
 *
 *   - `clapCount` is always present (0 for a never-clapped article).
 *   - `viewer` block is present for authenticated callers only; for
 *     anonymous callers the property is *omitted*, not `null`.
 */

test.describe("@smoke @api article-view clap fields", () => {
  test("clapCount reflects the aggregate across all readers", async ({
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

    const reader1 = await createLoggedInApi(browser, baseURL);
    const reader2 = await createLoggedInApi(browser, baseURL);
    await clapFactory.create(reader1.api, article.slug, { delta: 3 });
    await clapFactory.create(reader2.api, article.slug, { delta: 5 });

    const res = await api.get(`/api/articles/${article.slug}`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      article: { clapCount: number };
    };
    expect(body.article.clapCount).toBe(8);

    await author.context.close();
    await reader1.context.close();
    await reader2.context.close();
  });

  test("viewer block present for a signed-in caller with clap state", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
    clapFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });
    await clapFactory.create(loggedInPage.request, article.slug, { delta: 4 });

    const res = await loggedInPage.request.get(
      `/api/articles/${article.slug}`,
    );
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      article: {
        clapCount: number;
        viewer?: { clapCount: number; hasClapped: boolean };
      };
    };
    expect(body.article.clapCount).toBe(4);
    expect(body.article.viewer).toEqual({ clapCount: 4, hasClapped: true });

    await author.context.close();
  });

  test("viewer block reports zero + false for signed-in non-clapper", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const article = await articleFactory.create(author.api, {
      published: true,
    });

    const res = await loggedInPage.request.get(
      `/api/articles/${article.slug}`,
    );
    const body = (await res.json()) as {
      article: {
        clapCount: number;
        viewer?: { clapCount: number; hasClapped: boolean };
      };
    };
    expect(body.article.clapCount).toBe(0);
    expect(body.article.viewer).toEqual({ clapCount: 0, hasClapped: false });

    await author.context.close();
  });

  test("viewer block is OMITTED (not null) for anonymous callers", async ({
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
    // Add a clap so `clapCount > 0` — makes the "viewer stays absent
    // even when there's engagement to report" story concrete.
    const reader = await createLoggedInApi(browser, baseURL);
    await clapFactory.create(reader.api, article.slug, { delta: 2 });

    const res = await api.get(`/api/articles/${article.slug}`);
    const body = (await res.json()) as {
      article: { clapCount: number; viewer?: unknown };
    };
    expect(body.article.clapCount).toBe(2);
    // Discriminate on presence, not value — a `null` here would let a
    // downstream client with `viewer !== undefined` guards mistakenly
    // enter the signed-in branch.
    expect("viewer" in body.article).toBe(false);

    await author.context.close();
    await reader.context.close();
  });
});
