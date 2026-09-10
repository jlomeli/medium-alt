import { test, expect } from "@e2e/support/fixtures";
import { createLoggedInApi } from "@e2e/support/loginAs";

/**
 * `GET /api/users/{username}` — slice 9 additions. See
 * docs/specs/follow-lists.md § API contract.
 */

test.describe("@smoke @api @regression api/users counts", () => {
  test("response includes followerCount + followingCount, both DB-derived", async ({
    browser,
    baseURL,
    api,
    userFactory,
  }) => {
    const target = await userFactory.create();

    // Fresh user — zero on both sides.
    const initial = await api.get(`/api/users/${target.username}`);
    expect(initial.status()).toBe(200);
    const initialBody = (await initial.json()) as {
      username: string;
      followerCount: number;
      followingCount: number;
    };
    expect(initialBody.followerCount).toBe(0);
    expect(initialBody.followingCount).toBe(0);

    // A stranger follows the target — followerCount ticks to 1.
    const follower = await createLoggedInApi(browser, baseURL);
    await follower.api.post(`/api/users/${target.username}/follow`);
    const after = await api.get(`/api/users/${target.username}`);
    const afterBody = (await after.json()) as {
      followerCount: number;
      followingCount: number;
    };
    expect(afterBody.followerCount).toBe(1);
    expect(afterBody.followingCount).toBe(0);

    // Stranger unfollows — count reverts.
    await follower.api.delete(`/api/users/${target.username}/follow`);
    const reverted = await api.get(`/api/users/${target.username}`);
    const revertedBody = (await reverted.json()) as { followerCount: number };
    expect(revertedBody.followerCount).toBe(0);

    await follower.context.close();
  });
});
