import { test, expect } from "@e2e/support/fixtures";

/**
 * HTTP contract for POST /api/login — see docs/specs/auth-api.md.
 *
 * These tests hit the endpoint directly and never touch the /login form.
 * The endpoint wraps Auth.js `signIn()` under the hood, so the JWT cookie
 * side-effect is identical to what `next-auth/react`'s `signIn()` produces
 * in the browser.
 */

test.describe("@smoke @api api/login", () => {
  test("200 on valid credentials — returns user shape + sets session cookie", async ({
    api,
    userFactory,
  }) => {
    const user = await userFactory.create();

    const res = await api.post("/api/login", {
      data: { email: user.email, password: user.password },
    });

    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      user: { id: string; email: string; username: string };
    };
    expect(body.user).toMatchObject({
      email: user.email,
      username: user.username,
    });
    expect(typeof body.user.id).toBe("string");
    // Nothing sensitive leaked.
    expect(body.user).not.toHaveProperty("passwordHash");
    expect(body).not.toHaveProperty("passwordHash");

    // Session cookie must be present in the response's Set-Cookie chain.
    // Playwright's request context stores it in the fixture-level cookie
    // jar; a follow-up authenticated request should now succeed.
    const meRes = await api.get("/api/me");
    expect(meRes.status()).toBe(200);
  });

  test("401 on wrong password — generic invalid-credentials error", async ({
    api,
    userFactory,
  }) => {
    const user = await userFactory.create();

    const res = await api.post("/api/login", {
      data: { email: user.email, password: "Wrong-Password-9" },
    });

    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({ error: "invalid-credentials" });
  });

  test("401 on unknown email — byte-identical response to wrong-password", async ({
    api,
    userFactory,
  }) => {
    const bogus = userFactory.build();

    const res = await api.post("/api/login", {
      data: { email: bogus.email, password: bogus.password },
    });

    expect(res.status()).toBe(401);
    // Byte-for-byte identical to the wrong-password branch above —
    // anti-enumeration: nothing in the response distinguishes registered
    // from unregistered emails.
    expect(await res.json()).toEqual({ error: "invalid-credentials" });
  });

  test("400 on malformed email — field-scoped error matching /api/register", async ({ api }) => {
    const res = await api.post("/api/login", {
      data: { email: "not-an-email", password: "Passw0rd-x" },
    });

    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error: { field: string } };
    expect(body.error.field).toBe("email");
  });

  test("400 on missing password", async ({ api, userFactory }) => {
    const res = await api.post("/api/login", {
      data: { email: userFactory.build().email },
    });

    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error: { field: string } };
    expect(body.error.field).toBe("password");
  });

  test("does not leak passwordHash on either success or failure paths", async ({
    api,
    userFactory,
  }) => {
    const user = await userFactory.create();

    const ok = await api.post("/api/login", {
      data: { email: user.email, password: user.password },
    });
    expect(JSON.stringify(await ok.json())).not.toContain("passwordHash");

    const bad = await api.post("/api/login", {
      data: { email: user.email, password: "Wrong-Password-9" },
    });
    expect(JSON.stringify(await bad.json())).not.toContain("passwordHash");
  });
});
