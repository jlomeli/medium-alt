import { test, expect } from "@e2e/support/fixtures";
import { createLoggedInApi } from "@e2e/support/loginAs";

/**
 * HTTP contract for `GET /api/feed` — Your Feed. See
 * docs/specs/follow.md § API contract.
 */

test.describe("@smoke @api @regression your feed endpoint", () => {
  test("GET /api/feed — 200 with items + nextCursor shape", async ({
    loggedInPage,
  }) => {
    const res = await loggedInPage.request.get("/api/feed");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      items: unknown[];
      nextCursor: string | null;
    };
    expect(Array.isArray(body.items)).toBe(true);
    expect(body.nextCursor === null || typeof body.nextCursor === "string").toBe(
      true,
    );
  });

  test("returns published articles from followed authors only", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
    followFactory,
  }) => {
    const followed = await createLoggedInApi(browser, baseURL);
    const followedArticle = await articleFactory.create(followed.api, {
      published: true,
    });
    const stranger = await createLoggedInApi(browser, baseURL);
    const strangerArticle = await articleFactory.create(stranger.api, {
      published: true,
    });

    await followFactory.create(loggedInPage.request, followed.user.username);

    const res = await loggedInPage.request.get("/api/feed");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ slug: string }>;
    };
    const slugs = body.items.map((i) => i.slug);
    expect(slugs).toContain(followedArticle.slug);
    expect(slugs).not.toContain(strangerArticle.slug);

    await followed.context.close();
    await stranger.context.close();
  });

  test("viewer following nobody → 200 empty", async ({ loggedInPage }) => {
    // A fresh `loggedInPage` user has zero follows out of the box.
    const res = await loggedInPage.request.get("/api/feed");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      items: unknown[];
      nextCursor: string | null;
    };
    expect(body.items).toEqual([]);
    expect(body.nextCursor).toBeNull();
  });

  test("anonymous → 401", async ({ api }) => {
    const res = await api.get("/api/feed");
    expect(res.status()).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("unauthenticated");
  });

  test("malformed cursor → 400 field cursor", async ({ loggedInPage }) => {
    const res = await loggedInPage.request.get("/api/feed?cursor=not-a-cursor");
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error: { field: string } };
    expect(body.error.field).toBe("cursor");
  });

  test("out-of-range limit → 400 field limit", async ({ loggedInPage }) => {
    const res = await loggedInPage.request.get("/api/feed?limit=9999");
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error: { field: string } };
    expect(body.error.field).toBe("limit");
  });

  test("cursor pagination is stable and non-overlapping", async ({
    browser,
    baseURL,
    loggedInPage,
    articleFactory,
    followFactory,
  }) => {
    const author = await createLoggedInApi(browser, baseURL);
    const slugs: string[] = [];
    for (let i = 0; i < 3; i++) {
      const a = await articleFactory.create(author.api, { published: true });
      slugs.push(a.slug);
    }
    await followFactory.create(loggedInPage.request, author.user.username);

    const page1 = await loggedInPage.request.get("/api/feed?limit=2");
    const body1 = (await page1.json()) as {
      items: Array<{ slug: string }>;
      nextCursor: string | null;
    };
    const page1Slugs = body1.items
      .map((i) => i.slug)
      .filter((s) => slugs.includes(s));
    expect(page1Slugs.length).toBe(2);
    expect(body1.nextCursor).not.toBeNull();

    const page2 = await loggedInPage.request.get(
      `/api/feed?limit=2&cursor=${encodeURIComponent(body1.nextCursor!)}`,
    );
    const body2 = (await page2.json()) as {
      items: Array<{ slug: string }>;
      nextCursor: string | null;
    };
    const page2Slugs = body2.items
      .map((i) => i.slug)
      .filter((s) => slugs.includes(s));
    // No overlap between the two pages, one row on page 2 (of our
    // seeded three).
    expect(page2Slugs.length).toBe(1);
    expect(page1Slugs.some((s) => page2Slugs.includes(s))).toBe(false);

    await author.context.close();
  });

  test("viewer's own articles are excluded even if self-follow row exists", async ({
    loggedInPage,
    articleFactory,
  }) => {
    // We can't create a self-follow via the API (POST returns 400),
    // but the endpoint's `excludeAuthorId` guard is a belt-and-braces
    // filter — assert the shape it guarantees: an article by the
    // viewer never appears in their own Your Feed, regardless of
    // any follow state.
    const own = await articleFactory.create(loggedInPage.request, {
      published: true,
    });
    const res = await loggedInPage.request.get("/api/feed");
    const body = (await res.json()) as { items: Array<{ slug: string }> };
    expect(body.items.map((i) => i.slug)).not.toContain(own.slug);
  });
});
