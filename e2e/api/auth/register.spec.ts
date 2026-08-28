import { test, expect } from "@e2e/support/fixtures";

/**
 * HTTP contract for POST /api/register — see docs/specs/auth.md §API surface.
 *
 * The UI tests already cover the field-error rendering. These tests pin down
 * the *contract* the frontend and any external clients depend on.
 */

test.describe("@smoke @regression api/register", () => {
  test("@smoke 201 on valid payload", async ({ api, userFactory }) => {
    const attrs = userFactory.build();

    const res = await api.post("/api/register", { data: attrs });

    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      user: {
        id: expect.any(String),
        email: attrs.email,
        username: attrs.username,
      },
    });
    expect(body.user).not.toHaveProperty("passwordHash");
  });

  test("400 on duplicate email with field-scoped error code", async ({ api, userFactory }) => {
    const existing = await userFactory.create();

    const res = await api.post("/api/register", {
      data: { ...userFactory.build(), email: existing.email },
    });

    expect(res.status()).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { field: "email", code: "email-taken" },
    });
  });

  test("400 on duplicate username with field-scoped error code", async ({ api, userFactory }) => {
    const existing = await userFactory.create();

    const res = await api.post("/api/register", {
      data: { ...userFactory.build(), username: existing.username },
    });

    expect(res.status()).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { field: "username", code: "username-taken" },
    });
  });

  test("400 on Zod validation failure (weak password)", async ({ api, userFactory }) => {
    const res = await api.post("/api/register", {
      data: { ...userFactory.build(), password: "weak" },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.field).toBe("password");
  });

  test("400 on Zod validation failure (malformed email)", async ({ api, userFactory }) => {
    const res = await api.post("/api/register", {
      data: { ...userFactory.build(), email: "not-an-email" },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error.field).toBe("email");
  });
});
