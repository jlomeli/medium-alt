import { test, expect } from "@e2e/support/fixtures";

/**
 * HTTP contract for /api/users/{username} — see docs/specs/profile.md.
 *
 * Publicly accessible. Response body deliberately omits sensitive fields —
 * these tests pin down that shape.
 */

test.describe("@regression @api api/users", () => {
  test("GET /api/users/{username} returns the public shape", async ({ api, userFactory }) => {
    const user = await userFactory.create();

    const res = await api.get(`/api/users/${user.username}`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      username: user.username,
      name: user.name,
    });
    expect(body).toHaveProperty("bio");
    // Sensitive fields must not leak — enforced negatively.
    expect(body).not.toHaveProperty("id");
    expect(body).not.toHaveProperty("email");
    expect(body).not.toHaveProperty("passwordHash");
  });

  test("GET /api/users/{username} returns 404 for an unknown user", async ({ api }) => {
    const res = await api.get("/api/users/definitely-not-a-real-user-9x8y7z");
    expect(res.status()).toBe(404);
  });
});
