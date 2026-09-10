import { test, expect } from "@e2e/support/fixtures";
import { createLoggedInApi } from "@e2e/support/loginAs";
import { FollowListPage } from "@e2e/support/pom/follow-list.page";

/**
 * Acceptance criteria from docs/specs/follow-lists.md → § Following
 * list. Mirror of the followers list — same rules, flipped
 * direction of the underlying Follow rows.
 */

test.describe("@regression following list", () => {
  test("renders h1 + a per-row Follow button for the signed-in viewer", async ({
    browser,
    baseURL,
    loggedInPage,
    userFactory,
  }) => {
    // Target follows two other users; the signed-in viewer is an
    // outsider whose Follow buttons all read `Follow` on first paint.
    const _ = loggedInPage;
    void _;
    const target = await createLoggedInApi(browser, baseURL);
    const followedA = await userFactory.create();
    const followedB = await userFactory.create();
    await target.api.post(`/api/users/${followedA.username}/follow`);
    await target.api.post(`/api/users/${followedB.username}/follow`);

    const page = new FollowListPage(loggedInPage);
    await page.gotoFollowing(target.user.username);

    await expect(page.heading).toHaveText(
      `People @${target.user.username} follows`,
    );
    await expect(page.followButtonFor(followedA.username)).toBeVisible();
    await expect(page.followButtonFor(followedB.username)).toBeVisible();

    await target.context.close();
  });

  test("unknown username → 404", async ({ page }) => {
    const list = new FollowListPage(page);
    await list.gotoFollowing("definitely-not-a-real-user-9x8y7z");
    await expect(list.notFoundHeading).toBeVisible();
  });

  test("zero following renders an empty state, not pagination", async ({
    page,
    userFactory,
  }) => {
    const target = await userFactory.create();
    const list = new FollowListPage(page);
    await list.gotoFollowing(target.username);

    await expect(list.emptyState).toBeVisible();
    await expect(list.nextLink).toHaveCount(0);
  });
});
