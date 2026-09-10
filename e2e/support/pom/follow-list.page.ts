import type { Page } from "@playwright/test";
import { BasePage } from "./base.page";

/**
 * Page Object for `/profiles/[username]/{followers,following}`. See
 * docs/specs/follow-lists.md § UI surface.
 *
 * Locators are role/name-first. The two list pages share this class
 * — the direction is implicit in whichever URL `.goto*()` navigated
 * to. Callers passing a `kind` build the correct URL; the DOM
 * affordances are structurally identical past the `<h1>`.
 */
export class FollowListPage extends BasePage {
  readonly url = "/profiles";

  readonly heading;
  readonly nextLink;
  readonly emptyState;
  readonly notFoundHeading;

  constructor(page: Page) {
    super(page);
    this.heading = this.page.getByRole("heading", { level: 1 });
    // Pagination footer is a `<nav aria-label="Pagination">` wrapping
    // a "Next" link — one accessible name we can query directly.
    this.nextLink = this.page.getByRole("link", { name: "Next" });
    this.emptyState = this.page.getByRole("region", { name: "Empty state" });
    this.notFoundHeading = this.page.getByRole("heading", {
      name: /not found/i,
    });
  }

  async gotoFollowers(username: string): Promise<void> {
    await this.page.goto(`/profiles/${username}/followers`);
  }

  async gotoFollowing(username: string): Promise<void> {
    await this.page.goto(`/profiles/${username}/following`);
  }

  /**
   * Row locator for a specific `@handle`. Matches on the row's
   * `<h1>`-adjacent handle line — the unique per-row anchor even
   * when two users share a display name.
   */
  rowFor(username: string) {
    return this.page.getByText(`@${username}`, { exact: true });
  }

  followButtonFor(username: string) {
    return this.page
      .getByRole("listitem")
      .filter({ hasText: `@${username}` })
      .getByRole("button", { name: "Follow" });
  }

  unfollowButtonFor(username: string) {
    return this.page
      .getByRole("listitem")
      .filter({ hasText: `@${username}` })
      .getByRole("button", { name: "Unfollow" });
  }

  followLinkFor(username: string) {
    return this.page
      .getByRole("listitem")
      .filter({ hasText: `@${username}` })
      .getByRole("link", { name: "Follow" });
  }
}
