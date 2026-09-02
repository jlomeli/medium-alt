import { test, expect } from "@e2e/support/fixtures";
import { PublicProfilePage } from "@e2e/support/pom/public-profile.page";

/**
 * Acceptance criteria from docs/specs/follow.md → § Follow button on
 * the profile.
 */

test.describe("@smoke @regression follow button on profile", () => {
  test("signed-in viewer can follow, then unfollow, another user", async ({
    loggedInPage,
    userFactory,
  }) => {
    const target = await userFactory.create();
    const profile = new PublicProfilePage(loggedInPage);

    await profile.gotoUsername(target.username);
    await expect(profile.followButton).toBeVisible();

    await profile.followButton.click();
    // Server component re-runs after router.refresh(); the label is
    // authoritative, not optimistic — waiting on it is waiting on the
    // DB read landing.
    await expect(profile.unfollowButton).toBeVisible();

    await profile.unfollowButton.click();
    await expect(profile.followButton).toBeVisible();
  });

  test("follow state survives a full page reload", async ({
    loggedInPage,
    userFactory,
  }) => {
    const target = await userFactory.create();
    const profile = new PublicProfilePage(loggedInPage);

    await profile.gotoUsername(target.username);
    await profile.followButton.click();
    await expect(profile.unfollowButton).toBeVisible();

    await loggedInPage.reload();
    // The button label is derived from the DB on every render, not
    // from any client-side state — a reload must not flip it back.
    await expect(profile.unfollowButton).toBeVisible();
  });

  test("own profile never renders a Follow button", async ({ loggedInPage }) => {
    // Fetch the current viewer's username from /api/me — matches the
    // pattern in profile/public.spec.ts.
    const meRes = await loggedInPage.request.get("/api/me");
    const me = (await meRes.json()) as { username: string };
    const profile = new PublicProfilePage(loggedInPage);

    await profile.gotoUsername(me.username);
    // Absence, not just disabled — the affordance is not present in
    // the DOM at all.
    await expect(profile.followButton).toHaveCount(0);
    await expect(profile.unfollowButton).toHaveCount(0);
    await expect(profile.editProfileLink).toBeVisible();
  });

  test("anonymous click on Follow redirects to /login with callbackUrl", async ({
    page,
    userFactory,
  }) => {
    // Create a target through a throwaway request context, then visit
    // as an anonymous browser (the default `page` fixture has no
    // session cookie).
    const target = await userFactory.create();
    const profile = new PublicProfilePage(page);

    await profile.gotoUsername(target.username);
    // Anonymous fallback renders as a link, not a button.
    await expect(profile.followLink).toBeVisible();

    await profile.followLink.click();
    // callbackUrl round-trips the user back to the profile after login.
    await expect(page).toHaveURL(
      new RegExp(
        `/login\\?callbackUrl=${encodeURIComponent(
          `/profiles/${target.username}`,
        )}`,
      ),
    );
  });
});
