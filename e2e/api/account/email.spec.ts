import { test, expect } from "@e2e/support/fixtures";

/**
 * HTTP contract for the email-change surface:
 *   - POST /api/me/email          (202 request; 400 same-as-current; 401)
 *   - POST /api/me/email/resend   (204; 404 no-pending; 401)
 *   - POST /api/me/email/cancel   (204 idempotent; 401)
 *   - POST /api/me/email/confirm  (200; 400 invalid; 409 in-use)
 *
 * See docs/specs/account-security.md § API surface + § Anti-enumeration.
 */

function extractToken(body: { Text: string; HTML: string }): string {
  const src = `${body.Text}\n${body.HTML}`;
  const match = src.match(/[?&]token=([A-Za-z0-9._-]+)/);
  if (!match) throw new Error("no verification token found in email");
  return decodeURIComponent(match[1]!);
}

test.describe("@smoke @api @regression @needs-mailpit api/me/email", () => {
  // No mailpit.deleteAll() beforeEach — every test targets a unique
  // `newEmail` (fresh factory row or `Date.now()`-stamped), so the
  // `to:` filter in `mailpit.waitForMessageTo` already isolates each
  // test's mail. A cross-worker purge here would otherwise race with
  // another test's send between its 202 and its poll start.

  test("202 pending for a fresh new email + verification dispatched", async ({
    loggedInUser,
    mailpit,
  }) => {
    const { page } = loggedInUser;
    const target = `fresh-${Date.now()}@example.test`;

    const res = await page.request.post("/api/me/email", {
      data: { newEmail: target },
    });

    expect(res.status()).toBe(202);
    expect(await res.json()).toEqual({ pending: true });

    // Verification email lands in Mailpit — same 202 branch always sends.
    const message = await mailpit.waitForMessageTo(target, {
      subjectContains: "verify",
    });
    expect(message.Subject.toLowerCase()).toContain("verify");
  });

  test("anti-enumeration: address already in use → identical 202 shape, no email", async ({
    loggedInUser,
    userFactory,
    mailpit,
  }) => {
    const { page } = loggedInUser;
    const claimed = await userFactory.create();

    const res = await page.request.post("/api/me/email", {
      data: { newEmail: claimed.email },
    });

    expect(res.status()).toBe(202);
    expect(await res.json()).toEqual({ pending: true });

    // No verification email is dispatched for the anti-enumeration branch.
    await expect(async () => {
      await mailpit.waitForMessageTo(claimed.email, {
        subjectContains: "verify",
        timeoutMs: 1500,
      });
    }).rejects.toThrow();
  });

  test("400 newEmail/same-as-current when new equals current", async ({
    loggedInUser,
  }) => {
    const { page, user } = loggedInUser;

    const res = await page.request.post("/api/me/email", {
      data: { newEmail: user.email },
    });

    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error: { field: string; code: string } };
    expect(body.error).toMatchObject({
      field: "newEmail",
      code: "same-as-current",
    });
  });

  test("401 unauthenticated with no session cookie", async ({ api }) => {
    const res = await api.post("/api/me/email", {
      data: { newEmail: `x-${Date.now()}@example.test` },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe("@api @regression @needs-mailpit api/me/email/resend + /cancel", () => {
  // No mailpit.deleteAll() beforeEach — every test targets a unique
  // `newEmail` (fresh factory row or `Date.now()`-stamped), so the
  // `to:` filter in `mailpit.waitForMessageTo` already isolates each
  // test's mail. A cross-worker purge here would otherwise race with
  // another test's send between its 202 and its poll start.

  test("204 on resend when a pending row exists", async ({
    loggedInUser,
    pendingEmailChangeFactory,
  }) => {
    const { page } = loggedInUser;
    await pendingEmailChangeFactory.create(page.request);

    // Assert only the API contract here (204). The "resend rotates the
    // token and dispatches a NEW mail to the same address" invariant
    // is covered by the UI pending-state test, which compares tokens
    // across two Mailpit fetches — a global `deleteAll()` here would
    // race with parallel workers' sends.
    const res = await page.request.post("/api/me/email/resend");
    expect(res.status()).toBe(204);
  });

  test("404 no-pending on resend when no row exists", async ({ loggedInUser }) => {
    const { page } = loggedInUser;

    const res = await page.request.post("/api/me/email/resend");
    expect(res.status()).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error).toMatchObject({ code: "no-pending" });
  });

  test("204 on cancel when a pending row exists", async ({
    loggedInUser,
    pendingEmailChangeFactory,
  }) => {
    const { page } = loggedInUser;
    await pendingEmailChangeFactory.create(page.request);

    const res = await page.request.post("/api/me/email/cancel");
    expect(res.status()).toBe(204);
  });

  test("204 on cancel is idempotent (no pending row → still 204)", async ({
    loggedInUser,
  }) => {
    const { page } = loggedInUser;
    const res = await page.request.post("/api/me/email/cancel");
    expect(res.status()).toBe(204);
  });

  test("401 on resend when unauthenticated", async ({ api }) => {
    const res = await api.post("/api/me/email/resend");
    expect(res.status()).toBe(401);
  });
});

test.describe("@api @regression @needs-mailpit api/me/email/confirm", () => {
  // No mailpit.deleteAll() beforeEach — every test targets a unique
  // `newEmail` (fresh factory row or `Date.now()`-stamped), so the
  // `to:` filter in `mailpit.waitForMessageTo` already isolates each
  // test's mail. A cross-worker purge here would otherwise race with
  // another test's send between its 202 and its poll start.

  test("200 { email } on valid unexpired token + row consumed", async ({
    loggedInUser,
    pendingEmailChangeFactory,
    mailpit,
    api,
  }) => {
    const { page } = loggedInUser;
    const { newEmail } = await pendingEmailChangeFactory.create(page.request);
    const message = await mailpit.waitForMessageTo(newEmail, {
      subjectContains: "verify",
    });
    const token = extractToken(message);

    // Confirm is public (no session required) — hit it via the raw
    // `api` context to exercise that path.
    const res = await api.post("/api/me/email/confirm", { data: { token } });
    expect(res.status()).toBe(200);
    expect(await res.json()).toEqual({ email: newEmail });

    // Second POST with the same token is now invalid — row consumed.
    const reused = await api.post("/api/me/email/confirm", { data: { token } });
    expect(reused.status()).toBe(400);
  });

  test("400 token/invalid on unknown token", async ({ api }) => {
    const bogus = "a".repeat(64);
    const res = await api.post("/api/me/email/confirm", { data: { token: bogus } });
    expect(res.status()).toBe(400);
    const body = (await res.json()) as { error: { field: string; code: string } };
    expect(body.error).toMatchObject({ field: "token", code: "invalid" });
  });

  test("409 email/in-use when target claimed after request", async ({
    loggedInUser,
    userFactory,
    pendingEmailChangeFactory,
    mailpit,
    api,
  }) => {
    const { page } = loggedInUser;
    const target = `claimed-${Date.now()}@example.test`;
    await pendingEmailChangeFactory.create(page.request, { newEmail: target });
    const message = await mailpit.waitForMessageTo(target, {
      subjectContains: "verify",
    });
    const token = extractToken(message);

    // Second user registers with the target address.
    await userFactory.create({ email: target });

    const res = await api.post("/api/me/email/confirm", { data: { token } });
    expect(res.status()).toBe(409);
    const body = (await res.json()) as { error: { field: string; code: string } };
    expect(body.error).toMatchObject({ field: "email", code: "in-use" });
  });
});
