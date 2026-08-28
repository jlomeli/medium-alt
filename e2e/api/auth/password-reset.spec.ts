import { test, expect } from "@e2e/support/fixtures";

/**
 * HTTP contract for /api/password-reset/* — see docs/specs/auth.md §API surface.
 *
 * The request endpoint is deliberately opaque: it always returns 200 { ok: true }
 * regardless of whether the email exists. The confirm endpoint is where the
 * typed error taxonomy lives.
 */

/** Extract the reset token from the emailed link. */
function extractToken(body: { Text: string; HTML: string }): string {
  const src = `${body.Text}\n${body.HTML}`;
  const match = src.match(/[?&]token=([A-Za-z0-9._-]+)/);
  if (!match) throw new Error("no reset token found in email");
  return decodeURIComponent(match[1]!);
}

test.describe("@regression api/password-reset/request", () => {
  test.beforeEach(async ({ mailpit }) => {
    await mailpit.deleteAll();
  });

  test("returns 200 { ok: true } for a known email", async ({ api, userFactory }) => {
    const user = await userFactory.create();

    const res = await api.post("/api/password-reset/request", {
      data: { email: user.email },
    });

    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  test("returns identical 200 { ok: true } for an unknown email (no enumeration)", async ({
    api,
    userFactory,
  }) => {
    const res = await api.post("/api/password-reset/request", {
      data: { email: userFactory.build().email },
    });

    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

test.describe("@regression api/password-reset/confirm", () => {
  test.beforeEach(async ({ mailpit }) => {
    await mailpit.deleteAll();
  });

  test("returns 200 on success + subsequent login with new password works", async ({
    api,
    userFactory,
    mailpit,
  }) => {
    const user = await userFactory.create();
    await api.post("/api/password-reset/request", { data: { email: user.email } });
    const email = await mailpit.waitForMessageTo(user.email, { subjectContains: "reset" });
    const token = extractToken(email);

    const res = await api.post("/api/password-reset/confirm", {
      data: { token, newPassword: "Newp@ss-word-9" },
    });

    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  // Same reason as the UI expiration test: drives the seam that's off in
  // Vercel production, so nightly-full (targeting the prod URL) skips it.
  test("@needs-test-seam returns 400 { error: 'expired' } for a stale token", async ({
    api,
    userFactory,
    mailpit,
  }) => {
    const user = await userFactory.create();
    await api.post("/api/password-reset/request", { data: { email: user.email } });
    const email = await mailpit.waitForMessageTo(user.email, { subjectContains: "reset" });
    const token = extractToken(email);

    const expired = await api.post("/api/test/password-reset/expire", { data: { token } });
    expect(expired.ok()).toBeTruthy();

    const res = await api.post("/api/password-reset/confirm", {
      data: { token, newPassword: "Newp@ss-word-9" },
    });

    expect(res.status()).toBe(400);
    expect(await res.json()).toMatchObject({ error: "expired" });
  });

  test("returns 400 { error: 'invalid' } when reused", async ({ api, userFactory, mailpit }) => {
    const user = await userFactory.create();
    await api.post("/api/password-reset/request", { data: { email: user.email } });
    const email = await mailpit.waitForMessageTo(user.email, { subjectContains: "reset" });
    const token = extractToken(email);

    const first = await api.post("/api/password-reset/confirm", {
      data: { token, newPassword: "Newp@ss-word-9" },
    });
    expect(first.status()).toBe(200);

    const second = await api.post("/api/password-reset/confirm", {
      data: { token, newPassword: "AnotherNewP4ssword" },
    });
    expect(second.status()).toBe(400);
    expect(await second.json()).toMatchObject({ error: "invalid" });
  });

  test("returns 400 { error: 'weak-password' } when new password fails policy", async ({
    api,
    userFactory,
    mailpit,
  }) => {
    const user = await userFactory.create();
    await api.post("/api/password-reset/request", { data: { email: user.email } });
    const email = await mailpit.waitForMessageTo(user.email, { subjectContains: "reset" });
    const token = extractToken(email);

    const res = await api.post("/api/password-reset/confirm", {
      data: { token, newPassword: "weak" },
    });

    expect(res.status()).toBe(400);
    expect(await res.json()).toMatchObject({ error: "weak-password" });
  });
});
