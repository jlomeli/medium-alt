import { test, expect } from "@e2e/support/fixtures";

/**
 * HTTP contract for POST /api/logout — see docs/specs/auth-api.md.
 *
 * Logout endpoint already exists (from PR #4); this spec pins the
 * documented contract so the OpenAPI entry stays honest.
 */

test.describe("@smoke @api api/logout", () => {
  test("303 to / with Set-Cookie clearing session cookies", async ({ api, userFactory }) => {
    const user = await userFactory.create();
    // Log in via the new /api/login so both endpoints share a request
    // context and can observe each other's cookie effects.
    const loginRes = await api.post("/api/login", {
      data: { email: user.email, password: user.password },
    });
    expect(loginRes.status()).toBe(200);

    // Don't follow the redirect — we want to inspect the raw response.
    const res = await api.post("/api/logout", { maxRedirects: 0 });
    expect(res.status()).toBe(303);
    expect(res.headers()["location"]).toContain("/");

    const setCookie = res.headersArray().filter((h) => h.name.toLowerCase() === "set-cookie");
    // At least one Set-Cookie should target the session cookie with an
    // expiration or empty value. Match both cookie name variants
    // (`authjs.session-token` on HTTP, `__Secure-`-prefixed on HTTPS).
    const clearsSession = setCookie.some(
      (h) =>
        /(__Secure-)?authjs\.session-token=/.test(h.value) &&
        /(Max-Age=0|Expires=Thu, 01 Jan 1970|=;)/.test(h.value),
    );
    expect(clearsSession, `Set-Cookie chain must clear the session cookie: ${setCookie.map((h) => h.value).join(" | ")}`).toBe(true);
  });

  test("after logout, GET /api/me returns 401", async ({ api, userFactory }) => {
    const user = await userFactory.create();
    await api.post("/api/login", {
      data: { email: user.email, password: user.password },
    });
    // Sanity: logged in before logout.
    expect((await api.get("/api/me")).status()).toBe(200);

    await api.post("/api/logout");

    expect((await api.get("/api/me")).status()).toBe(401);
  });
});
