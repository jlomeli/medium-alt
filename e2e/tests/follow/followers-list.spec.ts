import { test, expect } from "@e2e/support/fixtures";
import { createLoggedInApi } from "@e2e/support/loginAs";
import { FollowListPage } from "@e2e/support/pom/follow-list.page";

/**
 * Acceptance criteria from docs/specs/follow-lists.md → § Followers
 * list (`/profiles/[username]/followers`).
 */

test.describe("@smoke @regression followers list", () => {
  test("renders h1 + a per-row Follow button for the signed-in viewer", async ({
    browser,
    baseURL,
    loggedInPage,
    userFactory,
  }) => {
    // Target is followed by two other users; the signed-in viewer is
    // an outsider so every row's affordance is a Follow button they
    // can act on. `createLoggedInApi` returns a session-bearing
    // request context we drive the follows through.
    const target = await userFactory.create();
    const followerA = await createLoggedInApi(browser, baseURL);
    const followerB = await createLoggedInApi(browser, baseURL);
    await followerA.api.post(`/api/users/${target.username}/follow`);
    await followerB.api.post(`/api/users/${target.username}/follow`);

    const page = new FollowListPage(loggedInPage);
    await page.gotoFollowers(target.username);

    await expect(page.heading).toHaveText(
      `People following @${target.username}`,
    );

    // Each row exposes a Follow button — the signed-in viewer does
    // not yet follow either of the two.
    await expect(page.followButtonFor(followerA.user.username)).toBeVisible();
    await expect(page.followButtonFor(followerB.user.username)).toBeVisible();

    await followerA.context.close();
    await followerB.context.close();
  });

  test("viewer's own row on a followers list has no follow button", async ({
    browser,
    baseURL,
    loggedInUser,
  }) => {
    // Setup: an author `target` is followed by the viewer AND by
    // another stranger. Viewer navigates to `/profiles/target/followers`.
    //
    // Because the viewer is now one of `target`'s followers, viewer's
    // OWN row appears in the list — with `isSelf: true`. That row
    // must not render a Follow / Unfollow affordance (following
    // yourself is meaningless — same rule as the profile page).
    const target = await createLoggedInApi(browser, baseURL);
    const stranger = await createLoggedInApi(browser, baseURL);
    await loggedInUser.page.request.post(
      `/api/users/${target.user.username}/follow`,
    );
    await stranger.api.post(`/api/users/${target.user.username}/follow`);

    const page = new FollowListPage(loggedInUser.page);
    await page.gotoFollowers(target.user.username);

    // Stranger row has an actionable Follow button.
    await expect(page.followButtonFor(stranger.user.username)).toBeVisible();

    // Viewer's own row is present but exposes NEITHER a Follow
    // button, an Unfollow button, nor a Follow link.
    await expect(page.rowFor(loggedInUser.user.username)).toBeVisible();
    await expect(
      page.followButtonFor(loggedInUser.user.username),
    ).toHaveCount(0);
    await expect(
      page.unfollowButtonFor(loggedInUser.user.username),
    ).toHaveCount(0);
    await expect(
      page.followLinkFor(loggedInUser.user.username),
    ).toHaveCount(0);

    await target.context.close();
    await stranger.context.close();
  });

  test("unknown username → 404", async ({ page }) => {
    const list = new FollowListPage(page);
    await list.gotoFollowers("definitely-not-a-real-user-9x8y7z");
    await expect(list.notFoundHeading).toBeVisible();
  });

  test("zero followers renders an empty state, not pagination", async ({
    page,
    userFactory,
  }) => {
    const target = await userFactory.create();
    const list = new FollowListPage(page);
    await list.gotoFollowers(target.username);

    await expect(list.emptyState).toBeVisible();
    await expect(list.nextLink).toHaveCount(0);
  });

  test("anonymous viewer sees the same list with a Follow link (not button)", async ({
    browser,
    baseURL,
    page,
    userFactory,
  }) => {
    const target = await userFactory.create();
    const follower = await createLoggedInApi(browser, baseURL);
    await follower.api.post(`/api/users/${target.username}/follow`);

    const list = new FollowListPage(page);
    await list.gotoFollowers(target.username);

    // Anonymous fallback renders a link, not a button.
    await expect(list.followLinkFor(follower.user.username)).toBeVisible();
    await expect(list.followButtonFor(follower.user.username)).toHaveCount(0);

    await follower.context.close();
  });
});
