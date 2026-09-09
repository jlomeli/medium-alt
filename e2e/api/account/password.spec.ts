import { test, expect } from "@e2e/support/fixtures";

/**
 * HTTP contract for POST /api/me/password — see
 * docs/specs/account-security.md § API surface.
 *
 * Uses `loggedInUser` so tests have both the authed request context
 * AND the current password. The unauthenticated case uses the raw
 * `api` fixture (no session cookie).
 */
test.describe("@smoke @api @regression api/me/password", () => {
  test("200 { ok: true } for a valid current + new", async ({ loggedInUser }) => {
    const { page, user } = loggedInUser;

    const res = await page.request.post("/api/me/password", {
      data: {
        currentPassword: user.password,
        newPassword: "Newp@ss-word-9",
      },
    });

    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("400 currentPassword/invalid on wrong current", async ({ loggedInUser }) => {
    const { page } = loggedInUser;

    const res = await page.request.post("/api/me/password", {
      data: {
        currentPassword: "definitely-not-my-password-9",
        newPassword: "Newp@ss-word-9",
      },
    });

    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error: { field: string; code: string } };
    expect(body.error).toMatchObject({ field: "currentPassword", code: "invalid" });
  });

  test("400 newPassword/weak on policy miss", async ({ loggedInUser }) => {
    const { page, user } = loggedInUser;

    const res = await page.request.post("/api/me/password", {
      data: {
        currentPassword: user.password,
        newPassword: "short",
      },
    });

    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error: { field: string; code: string } };
    expect(body.error).toMatchObject({ field: "newPassword", code: "weak" });
  });

  test("400 newPassword/same-as-current when new = current", async ({
    loggedInUser,
  }) => {
    const { page, user } = loggedInUser;

    const res = await page.request.post("/api/me/password", {
      data: {
        currentPassword: user.password,
        newPassword: user.password,
      },
    });

    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error: { field: string; code: string } };
    expect(body.error).toMatchObject({
      field: "newPassword",
      code: "same-as-current",
    });
  });

  test("401 unauthenticated with no session cookie", async ({ api, userFactory }) => {
    const user = await userFactory.create();

    const res = await api.post("/api/me/password", {
      data: {
        currentPassword: user.password,
        newPassword: "Newp@ss-word-9",
      },
    });

    expect(res.status()).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error).toMatchObject({ code: "unauthenticated" });
  });
});
