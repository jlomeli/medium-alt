import { test, expect } from "@e2e/support/fixtures";

/**
 * HTTP contract for /api/me — see docs/specs/profile.md §API surface.
 *
 * These tests drive the endpoint directly via Playwright's request context.
 * `loggedInPage` isn't used because the request context we want is the same
 * one that carries the auth cookie — we grab the fixture-level context via
 * the pre-authenticated context helpers.
 */

test.describe("@smoke @api api/me", () => {
  test("GET /api/me returns 401 when unauthenticated", async ({ api }) => {
    const res = await api.get("/api/me");
    expect(res.status()).toBe(401);
  });

  test("GET /api/me returns the current user when signed in", async ({ loggedInPage }) => {
    const res = await loggedInPage.request.get("/api/me");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      id: string;
      email: string;
      username: string;
      name: string | null;
      bio: string | null;
    };
    expect(body.email).toMatch(/@example\.test$/);
    expect(body.username).toMatch(/^u-[a-f0-9]{8}$/);
    expect(body).not.toHaveProperty("passwordHash");
  });

  test("PATCH /api/me returns 401 when unauthenticated", async ({ api }) => {
    const res = await api.patch("/api/me", { data: { name: "hijack" } });
    expect(res.status()).toBe(401);
  });

  test("PATCH /api/me applies a valid partial update", async ({ loggedInPage }) => {
    const res = await loggedInPage.request.patch("/api/me", {
      data: { name: "Grace Hopper", bio: "Amazing Grace" },
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { name: string; bio: string };
    expect(body.name).toBe("Grace Hopper");
    expect(body.bio).toBe("Amazing Grace");
  });

  test("PATCH /api/me returns 400 with field/code on duplicate username", async ({
    loggedInPage,
    userFactory,
  }) => {
    const other = await userFactory.create();
    const res = await loggedInPage.request.patch("/api/me", {
      data: { username: other.username },
    });
    expect(res.status()).toBe(400);
    expect(await res.json()).toMatchObject({
      error: { field: "username", code: "username-taken" },
    });
  });

  test("PATCH /api/me returns 400 with field on invalid username", async ({ loggedInPage }) => {
    const res = await loggedInPage.request.patch("/api/me", {
      data: { username: "ab" },
    });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error: { field: string } };
    expect(body.error.field).toBe("username");
  });

  test("PATCH /api/me returns 400 with field on bio over max length", async ({ loggedInPage }) => {
    const res = await loggedInPage.request.patch("/api/me", {
      data: { bio: "x".repeat(281) },
    });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error: { field: string } };
    expect(body.error.field).toBe("bio");
  });

  test("PATCH /api/me returns 400 on empty payload", async ({ loggedInPage }) => {
    const res = await loggedInPage.request.patch("/api/me", { data: {} });
    expect(res.status()).toBe(400);
  });
});
