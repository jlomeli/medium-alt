import type { Page } from "@playwright/test";
import { BasePage } from "./base.page";

/**
 * Page Object for `/me` — the signed-in user's own dashboard.
 *
 * Every affordance queried by role/label. See docs/CODING_STANDARDS.md
 * §Testing.
 */
export class OwnProfilePage extends BasePage {
  readonly url = "/me";

  readonly heading;
  readonly editProfileLink;

  constructor(page: Page) {
    super(page);
    this.heading = this.page.getByRole("heading", { name: "Your profile" });
    this.editProfileLink = this.page.getByRole("link", { name: "Edit profile" });
  }
}
