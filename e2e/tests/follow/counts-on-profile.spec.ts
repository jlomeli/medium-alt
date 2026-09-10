import { test, expect } from "@e2e/support/fixtures";
import { PublicProfilePage } from "@e2e/support/pom/public-profile.page";

/**
 * Acceptance criteria from docs/specs/follow-lists.md → § Counts on
 * the profile header. Grouped in this spec so a change to the row's
 * copy or link shape shows every downstream break together.
 */

test.describe("@smoke @regression follow counts on profile", () => {
  test("profile renders count row with two links", async ({
    page,
    userFactory,
  }) => {
    const target = await userFactory.create();
    const profile = new PublicProfilePage(page);

    await profile.gotoUsername(target.username);

    // Both halves are always links, even at zero.
    const followersLink = page.getByRole("link", { name: /0 followers/ });
    const followingLink = page.getByRole("link", { name: /0 following/ });
    await expect(followersLink).toBeVisible();
    await expect(followingLink).toBeVisible();
    await expect(followersLink).toHaveAttribute(
      "href",
      `/profiles/${target.username}/followers`,
    );
    await expect(followingLink).toHaveAttribute(
      "href",
      `/profiles/${target.username}/following`,
    );
  });

  test("following someone from their profile increments the count", async ({
    loggedInPage,
    userFactory,
  }) => {
    const target = await userFactory.create();
    const profile = new PublicProfilePage(loggedInPage);
    await profile.gotoUsername(target.username);

    // Start: zero followers.
    await expect(
      loggedInPage.getByRole("link", { name: /0 followers/ }),
    ).toBeVisible();

    await profile.followButton.click();
    await expect(profile.unfollowButton).toBeVisible();

    // After the follow toggle + refresh, the count reflects the new
    // row.  DB-derived, not client-side — a reload must also see 1.
    await expect(
      loggedInPage.getByRole("link", { name: /1 followers/ }),
    ).toBeVisible();
    await loggedInPage.reload();
    await expect(
      loggedInPage.getByRole("link", { name: /1 followers/ }),
    ).toBeVisible();
  });

  test("own profile shows the same count row (no me-special-case)", async ({
    loggedInPage,
  }) => {
    const meRes = await loggedInPage.request.get("/api/me");
    const me = (await meRes.json()) as { username: string };
    const profile = new PublicProfilePage(loggedInPage);

    await profile.gotoUsername(me.username);
    await expect(
      loggedInPage.getByRole("link", { name: /0 followers/ }),
    ).toBeVisible();
    await expect(
      loggedInPage.getByRole("link", { name: /0 following/ }),
    ).toBeVisible();
  });
});
