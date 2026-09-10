import { test, expect } from "@e2e/support/fixtures";
import { createLoggedInApi } from "@e2e/support/loginAs";
import { FollowListPage } from "@e2e/support/pom/follow-list.page";

/**
 * Acceptance criterion from docs/specs/follow-lists.md → § Followers
 * list → pagination. Drives the endpoint at a small `limit` so a
 * 25-orbiter target isn't required — the factory-built target picks
 * up exactly enough followers for a two-page walk.
 *
 * Test builds its own state (isolation via uniqueness), not seed
 * data — CODING_STANDARDS §Testing.
 */

test.describe("@regression follow-list pagination", () => {
  test("cursor round-trip is stable + non-overlapping; Next disappears at end", async ({
    browser,
    baseURL,
    page,
    userFactory,
  }) => {
    // 3 followers, page size 2 → page 1 = [f3, f2], page 2 = [f1].
    // The page uses a fixed limit (default 20) internally, so we
    // drive the underlying API directly for the pagination assertion
    // and use the UI to prove the `Next` link renders + disappears.
    const target = await userFactory.create();
    const followers = await Promise.all([
      createLoggedInApi(browser, baseURL),
      createLoggedInApi(browser, baseURL),
      createLoggedInApi(browser, baseURL),
    ]);
    for (const f of followers) {
      const res = await f.api.post(`/api/users/${target.username}/follow`);
      expect(res.ok()).toBe(true);
    }

    // Page 1 with limit=2 — API returns a nextCursor.
    const page1Res = await page.request.get(
      `/api/users/${target.username}/followers?limit=2`,
    );
    expect(page1Res.status()).toBe(200);
    const page1 = (await page1Res.json()) as {
      items: Array<{ username: string }>;
      nextCursor: string | null;
    };
    expect(page1.items).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();

    // Page 2 with the returned cursor — smaller than a full page,
    // no further nextCursor.
    const page2Res = await page.request.get(
      `/api/users/${target.username}/followers?limit=2&cursor=${encodeURIComponent(
        page1.nextCursor!,
      )}`,
    );
    expect(page2Res.status()).toBe(200);
    const page2 = (await page2Res.json()) as {
      items: Array<{ username: string }>;
      nextCursor: string | null;
    };
    expect(page2.items).toHaveLength(1);
    expect(page2.nextCursor).toBeNull();

    // Non-overlapping across the boundary.
    const seen = new Set(page1.items.map((i) => i.username));
    for (const i of page2.items) {
      expect(seen.has(i.username)).toBe(false);
      seen.add(i.username);
    }
    expect(seen.size).toBe(3);

    // UI-level: with 3 followers and a default limit of 20, the
    // page renders no Next link (all fit on one page). Proves the
    // `Next appears iff another page exists` rule from the negative
    // direction.
    const list = new FollowListPage(page);
    await list.gotoFollowers(target.username);
    await expect(list.nextLink).toHaveCount(0);

    for (const f of followers) await f.context.close();
  });
});
