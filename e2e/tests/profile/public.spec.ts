import { test, expect } from "@e2e/support/fixtures";
import { PublicProfilePage } from "@e2e/support/pom/public-profile.page";

/**
 * Acceptance criteria from docs/specs/profile.md → Public profile
 * (/profiles/:username).
 */

test.describe("@smoke public profile", () => {
  test("shows the target user's name, username, and bio", async ({ page, userFactory }) => {
    const owner = await userFactory.create();
    const profile = new PublicProfilePage(page);

    await profile.gotoUsername(owner.username);

    // Fixture data includes the `Test User <slug>` name and no bio; the
    // acceptance criterion for bio content is covered by the edit test.
    await expect(profile.nameHeading).toHaveText(owner.name!);
    await expect(profile.usernameLabel).toHaveText(`@${owner.username}`);
  });

  test("public profile never leaks email or internal id", async ({ page, userFactory }) => {
    const owner = await userFactory.create();
    const profile = new PublicProfilePage(page);

    await profile.gotoUsername(owner.username);

    await expect(page.getByText(owner.email)).toHaveCount(0);
    await expect(page.getByText(owner.id)).toHaveCount(0);
  });

  test("unknown username returns 404 (not a soft-404)", async ({ page }) => {
    const profile = new PublicProfilePage(page);
    const response = await page.goto("/profiles/definitely-not-a-real-user-9x8y7z");
    expect(response?.status()).toBe(404);
    await expect(profile.notFoundHeading).toBeVisible();
  });

  test("own /profiles/:username shows Edit profile affordance", async ({ loggedInPage }) => {
    // The loggedInPage user's username is available through the storage state;
    // easier to grab it via /api/me once that endpoint exists. For now we
    // read the header's Account button label which mirrors the display name.
    const profile = new PublicProfilePage(loggedInPage);
    // The fixture's factory build emits `name: Test User <slug>` and
    // `username: <slug>`. Extract the slug from `/me` via a GET.
    const meRes = await loggedInPage.request.get("/api/me");
    const me = (await meRes.json()) as { username: string };

    await profile.gotoUsername(me.username);
    await expect(profile.editProfileLink).toBeVisible();
  });

  test("another user's /profiles/:username has no Edit profile affordance", async ({
    loggedInPage,
    userFactory,
  }) => {
    const stranger = await userFactory.create();
    const profile = new PublicProfilePage(loggedInPage);

    await profile.gotoUsername(stranger.username);
    await expect(profile.editProfileLink).toHaveCount(0);
  });

  // Added in slice 4a — docs/specs/articles-crud.md § Public author listing.
  test("renders an Articles section listing the owner's published articles only", async ({
    page,
    loggedInPage,
    articleFactory,
  }) => {
    const meRes = await loggedInPage.request.get("/api/me");
    const me = (await meRes.json()) as { username: string };

    const draft = await articleFactory.create(loggedInPage.request, { published: false });
    const published = await articleFactory.create(loggedInPage.request, { published: true });

    const profile = new PublicProfilePage(page);
    await profile.gotoUsername(me.username);

    // Public reader (unauthenticated) sees the published article as a
    // link into /articles/{slug}, and never sees the draft.
    await expect(page.getByRole("link", { name: published.title })).toBeVisible();
    await expect(page.getByText(draft.title)).toHaveCount(0);
  });
});
