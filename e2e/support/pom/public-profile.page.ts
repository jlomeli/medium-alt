import type { Page } from "@playwright/test";
import { BasePage } from "./base.page";

/**
 * Page Object for `/profiles/:username` — the public profile.
 *
 * The URL is parameterised; `.goto()` from the base class is overridden to
 * take the username.
 */
export class PublicProfilePage extends BasePage {
  readonly url = "/profiles";

  readonly nameHeading;
  readonly usernameLabel;
  readonly bio;
  readonly editProfileLink;
  readonly notFoundHeading;
  // Slice 6 — follow / unfollow affordance. `followButton` is the
  // signed-in <button>; `followLink` is the anonymous <a> that
  // bounces through /login. Both carry the accessible name "Follow"
  // (the button flips to "Unfollow" once the row exists).
  readonly followButton;
  readonly unfollowButton;
  readonly followLink;

  constructor(page: Page) {
    super(page);
    // The name is the h1 on the public profile.
    this.nameHeading = this.page.getByRole("heading", { level: 1 });
    // The username is shown next to the name; distinct role="paragraph" is
    // avoided so we match on visible text.
    this.usernameLabel = this.page.getByText(/^@/);
    // Bio is wrapped in a `<section aria-label="Bio">` on the impl side so
    // the free-form user text is announced with context by screen readers
    // and queryable by accessible name here.
    this.bio = this.page.getByRole("region", { name: "Bio" });
    this.editProfileLink = this.page.getByRole("link", { name: "Edit profile" });
    this.followButton = this.page.getByRole("button", { name: "Follow" });
    this.unfollowButton = this.page.getByRole("button", { name: "Unfollow" });
    this.followLink = this.page.getByRole("link", { name: "Follow" });
    // Next.js `not-found.tsx` renders a heading we can key off. Convention:
    // "This page could not be found." — checked in the app's not-found file.
    this.notFoundHeading = this.page.getByRole("heading", { name: /not found/i });
  }

  async gotoUsername(username: string): Promise<void> {
    await this.page.goto(`/profiles/${username}`);
  }
}
