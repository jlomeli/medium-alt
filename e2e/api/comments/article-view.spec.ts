import { test, expect } from "@e2e/support/fixtures";
import { createLoggedInApi } from "@e2e/support/loginAs";

/**
 * `ArticleView` gained `commentCount` in slice 8 — see
 * docs/specs/comments.md § Additive shape changes. The count on the
 * article-view response MUST equal the length of the GET-comments
 * list, or the read page will render a stale header.
 */

test.describe("@smoke @api ArticleView carries commentCount", () => {
  test("commentCount matches the list length", async ({
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

    // Empty to start — value present, is a number.
    const empty = await api.get(`/api/articles/${article.slug}`);
    expect(empty.status()).toBe(200);
    const emptyBody = (await empty.json()) as { commentCount: number };
    expect(emptyBody.commentCount).toBe(0);

    await commentFactory.create(reader.api, article.slug, "one");
    await commentFactory.create(reader.api, article.slug, "two");
    await commentFactory.create(reader.api, article.slug, "three");

    const withCommentsRes = await api.get(`/api/articles/${article.slug}`);
    const withComments = (await withCommentsRes.json()) as {
      commentCount: number;
    };
    expect(withComments.commentCount).toBe(3);

    const listRes = await api.get(`/api/articles/${article.slug}/comments`);
    const list = (await listRes.json()) as { items: unknown[] };
    expect(withComments.commentCount).toBe(list.items.length);

    await author.context.close();
    await reader.context.close();
  });

  test("draft article's commentCount is always 0", async ({
    browser,
    baseURL,
    articleFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const draft = await articleFactory.create(author.api, { published: false });

    const res = await author.api.get(`/api/articles/${draft.slug}`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { commentCount: number };
    expect(body.commentCount).toBe(0);

    await author.context.close();
  });
});
