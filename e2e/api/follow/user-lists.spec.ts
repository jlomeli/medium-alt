import { test, expect } from "@e2e/support/fixtures";
import { createLoggedInApi } from "@e2e/support/loginAs";

/**
 * HTTP contract for `GET /api/users/{username}/{followers,following}` —
 * docs/specs/follow-lists.md § API contract.
 */

test.describe("@smoke @api @regression follow user-lists endpoints", () => {
  test("followers — happy path with signed-in caller emits viewerFollows + isSelf", async ({
    browser,
    baseURL,
    loggedInPage,
    userFactory,
  }) => {
    const target = await userFactory.create();
    const followerA = await createLoggedInApi(browser, baseURL);
    await followerA.api.post(`/api/users/${target.username}/follow`);

    const res = await loggedInPage.request.get(
      `/api/users/${target.username}/followers`,
    );
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      items: Array<{
        username: string;
        name: string | null;
        bioExcerpt: string | null;
        viewerFollows: boolean;
        isSelf: boolean;
      }>;
      nextCursor: string | null;
    };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.username).toBe(followerA.user.username);
    // Signed-in caller — both viewer fields present, both `false`
    // for a stranger's follower.
    expect(body.items[0]!.viewerFollows).toBe(false);
    expect(body.items[0]!.isSelf).toBe(false);

    await followerA.context.close();
  });

  test("followers — anonymous response strips viewerFollows + isSelf", async ({
    browser,
    baseURL,
    api,
    userFactory,
  }) => {
    const target = await userFactory.create();
    const follower = await createLoggedInApi(browser, baseURL);
    await follower.api.post(`/api/users/${target.username}/follow`);

    const res = await api.get(`/api/users/${target.username}/followers`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { items: Array<Record<string, unknown>> };
    expect(body.items).toHaveLength(1);
    // Absence, not `null` — the shape should not carry the fields at
    // all on an anonymous call.
    expect(body.items[0]).not.toHaveProperty("viewerFollows");
    expect(body.items[0]).not.toHaveProperty("isSelf");

    await follower.context.close();
  });

  test("followers — zero followers → 200 with empty items array", async ({
    api,
    userFactory,
  }) => {
    const target = await userFactory.create();
    const res = await api.get(`/api/users/${target.username}/followers`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      items: unknown[];
      nextCursor: string | null;
    };
    expect(body.items).toEqual([]);
    expect(body.nextCursor).toBeNull();
  });

  test("followers — unknown username → 404 with field envelope", async ({
    api,
  }) => {
    const res = await api.get(
      `/api/users/definitely-not-a-real-user-9x8y7z/followers`,
    );
    expect(res.status()).toBe(404);
    const body = (await res.json()) as {
      error: { field: string; code: string };
    };
    expect(body.error.field).toBe("username");
    expect(body.error.code).toBe("not-found");
  });

  test("followers — malformed cursor → 400 field:cursor code:invalid", async ({
    api,
    userFactory,
  }) => {
    const target = await userFactory.create();
    const res = await api.get(
      `/api/users/${target.username}/followers?cursor=not-a-real-cursor`,
    );
    expect(res.status()).toBe(400);
    const body = (await res.json()) as {
      error: { field: string; code: string };
    };
    expect(body.error.field).toBe("cursor");
    expect(body.error.code).toBe("invalid");
  });

  test("followers — out-of-range limit → 400 field:limit code:invalid", async ({
    api,
    userFactory,
  }) => {
    const target = await userFactory.create();
    const res = await api.get(
      `/api/users/${target.username}/followers?limit=0`,
    );
    expect(res.status()).toBe(400);
    const body = (await res.json()) as {
      error: { field: string; code: string };
    };
    expect(body.error.field).toBe("limit");
    // The Zod pipeline emits its own `custom` issue on numeric range,
    // which the route lifts as `code: "invalid"`.
    expect(body.error.code).toBe("invalid");
  });

  test("following — mirrors followers direction (own follow lists that user)", async ({
    browser,
    baseURL,
    api,
    userFactory,
  }) => {
    const target = await createLoggedInApi(browser, baseURL);
    const followed = await userFactory.create();
    await target.api.post(`/api/users/${followed.username}/follow`);

    const res = await api.get(`/api/users/${target.user.username}/following`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ username: string }>;
      nextCursor: string | null;
    };
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.username).toBe(followed.username);

    await target.context.close();
  });

  test("following — unknown username → 404", async ({ api }) => {
    const res = await api.get(
      `/api/users/definitely-not-a-real-user-9x8y7z/following`,
    );
    expect(res.status()).toBe(404);
  });
});
