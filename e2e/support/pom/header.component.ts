import type { Page, Locator } from "@playwright/test";

/**
 * Component Object for the site-wide header.
 *
 * The header is the auth-state indicator: signed-out shows "Log in" / "Sign up"
 * links; signed-in shows an account menu whose accessible name is the user's
 * display name and which contains a "Log out" button.
 *
 * Component Objects live under `support/pom/*.component.ts` and encapsulate a
 * cross-page fragment. See docs/CODING_STANDARDS.md §Testing.
 */
export class HeaderComponent {
  readonly logInLink: Locator;
  readonly signUpLink: Locator;
  readonly accountMenuButton: Locator;
  readonly logOutButton: Locator;

  constructor(private readonly page: Page) {
    const nav = this.page.getByRole("banner");
    this.logInLink = nav.getByRole("link", { name: "Log in" });
    this.signUpLink = nav.getByRole("link", { name: "Sign up" });
    this.accountMenuButton = nav.getByRole("button", { name: "Account" });
    // Log out lives inside the menu; opening the menu reveals it.
    this.logOutButton = this.page.getByRole("menuitem", { name: "Log out" });
  }

  async openMenu(): Promise<void> {
    await this.accountMenuButton.click();
  }

  async logOut(): Promise<void> {
    await this.openMenu();
    // The "Log out" menuitem is inside a `<form action="/api/logout">`. Wait
    // for that form's 303 response to land before treating logout as done —
    // otherwise subsequent goto() calls race the Set-Cookie header.
    await Promise.all([
      this.page.waitForResponse(
        (res) => res.url().endsWith("/api/logout") && res.request().method() === "POST",
      ),
      this.logOutButton.click(),
    ]);
    await this.page.waitForURL("/");
  }
}
