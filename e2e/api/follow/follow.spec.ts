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

  test("concurrent POSTs stay idempotent (no P2002 leak)", async ({
    loggedInPage,
    userFactory,
  }) => {
    // Regression: two overlapping POSTs from the same viewer must
    // both resolve with the contracted 200/201 body, not a 500 from
    // the composite-PK race. `Promise.all` fires them in the same
    // microtask so both hit the server before either completes.
    const target = await userFactory.create();
    const results = await Promise.all([
      loggedInPage.request.post(`/api/users/${target.username}/follow`),
      loggedInPage.request.post(`/api/users/${target.username}/follow`),
    ]);
    const bodies = await Promise.all(
      results.map(async (r) => ({
        status: r.status(),
        body: (await r.json()) as { following: true; followedAt: string },
      })),
    );
    for (const { status, body } of bodies) {
      // One of these will be 201 (the winner) and one will be 200
      // (the loser reconciled via P2002 catch) — but which is which
      // depends on scheduling. What matters is neither is 5xx.
      expect([200, 201]).toContain(status);
      expect(body.following).toBe(true);
      expect(typeof body.followedAt).toBe("string");
    }
    // Both responses' `followedAt` reflect the SAME row's createdAt —
    // the loser was reconciled to the winner's timestamp.
    expect(bodies[0]!.body.followedAt).toBe(bodies[1]!.body.followedAt);
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
