import { test, expect } from "@e2e/support/fixtures";
import { createLoggedInApi } from "@e2e/support/loginAs";

/**
 * HTTP contract for POST/DELETE `/api/users/{username}/follow` —
 * docs/specs/follow.md § API contract.
 */

test.describe("@smoke @api @regression follow endpoints", () => {
  test("POST — 201 on create, 200 on idempotent repeat", async ({
    loggedInPage,
    userFactory,
  }) => {
    const target = await userFactory.create();

    const first = await loggedInPage.request.post(
      `/api/users/${target.username}/follow`,
    );
    expect(first.status()).toBe(201);
    const firstBody = (await first.json()) as {
      following: true;
      followedAt: string;
    };
    expect(firstBody.following).toBe(true);
    expect(typeof firstBody.followedAt).toBe("string");

    // Repeat call — same body shape, `followedAt` preserved (upsert
    // does not touch `createdAt`).
    const second = await loggedInPage.request.post(
      `/api/users/${target.username}/follow`,
    );
    expect(second.status()).toBe(200);
    const secondBody = (await second.json()) as {
      following: true;
      followedAt: string;
    };
    expect(secondBody).toEqual(firstBody);
  });

  test("POST — self-follow returns 400 self-follow", async ({
    loggedInPage,
  }) => {
    const meRes = await loggedInPage.request.get("/api/me");
    const me = (await meRes.json()) as { username: string };

    const res = await loggedInPage.request.post(
      `/api/users/${me.username}/follow`,
    );
    expect(res.status()).toBe(400);
    const body = (await res.json()) as {
      error: { field: string; code: string };
    };
    expect(body.error.field).toBe("username");
    expect(body.error.code).toBe("self-follow");
  });

  test("POST — unknown target 404", async ({ loggedInPage }) => {
    const res = await loggedInPage.request.post(
      `/api/users/definitely-not-a-user-9x8y7z/follow`,
    );
    expect(res.status()).toBe(404);
  });

  test("POST — anonymous 401", async ({ api, userFactory }) => {
    const target = await userFactory.create();
    const res = await api.post(`/api/users/${target.username}/follow`);
    expect(res.status()).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("unauthenticated");
  });

  test("DELETE — 204 whether or not a row existed (idempotent)", async ({
    loggedInPage,
    userFactory,
  }) => {
    const target = await userFactory.create();

    // No row yet → still 204.
    const emptyDelete = await loggedInPage.request.delete(
      `/api/users/${target.username}/follow`,
    );
    expect(emptyDelete.status()).toBe(204);

    // Now create a row, then delete it, then delete again.
    await loggedInPage.request.post(`/api/users/${target.username}/follow`);
    const firstDelete = await loggedInPage.request.delete(
      `/api/users/${target.username}/follow`,
    );
    expect(firstDelete.status()).toBe(204);
    const secondDelete = await loggedInPage.request.delete(
      `/api/users/${target.username}/follow`,
    );
    expect(secondDelete.status()).toBe(204);
  });

  test("DELETE — unknown target 404", async ({ loggedInPage }) => {
    const res = await loggedInPage.request.delete(
      `/api/users/definitely-not-a-user-9x8y7z/follow`,
    );
    expect(res.status()).toBe(404);
  });

  test("DELETE — anonymous 401", async ({ api, userFactory }) => {
    const target = await userFactory.create();
    const res = await api.delete(`/api/users/${target.username}/follow`);
    expect(res.status()).toBe(401);
  });

  test("follow relationship is directional (A→B ≠ B→A)", async ({
    browser,
    baseURL,
    loggedInPage,
    userFactory,
  }) => {
    // Viewer follows target. Verify a fresh, unrelated user still
    // sees an empty Your Feed — the follow row is directional, not
    // reciprocal.
    const target = await userFactory.create();
    await loggedInPage.request.post(`/api/users/${target.username}/follow`);

    const strangerSession = await createLoggedInApi(browser, baseURL);
    const strangerFeed = await strangerSession.api.get("/api/feed");
    expect(strangerFeed.status()).toBe(200);
    const body = (await strangerFeed.json()) as {
      items: unknown[];
      nextCursor: string | null;
    };
    expect(body.items).toEqual([]);
    expect(body.nextCursor).toBeNull();
    await strangerSession.context.close();
  });
});
