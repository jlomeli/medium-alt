import type { Page, Locator } from "@playwright/test";

/**
 * Component Object for the site-wide header.
 *
 * The header is the auth-state indicator: signed-out shows "Log in" / "Sign up"
 * links; signed-in shows an account menu whose accessible name is "Account"
 * and which contains a "Log out" menuitem.
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
    // The menuitem submits `<form action="/api/logout">` — POST → 303 → GET /.
    // Wait on the "Log in" link (only rendered when the server-side auth()
    // check sees no session) as the completion signal.
    await this.logOutButton.click();
    await this.logInLink.waitFor({ state: "visible" });
    // Belt-and-suspenders: Chromium under parallel-workers load has been
    // observed occasionally missing the Set-Cookie clear from the 303
    // response, leaving a valid-looking JWT in the context jar even though
    // the server-rendered Header already reflects the signed-out state.
    // Subsequent goto() calls then race the stale cookie. The endpoint's
    // Set-Cookie is unchanged — this only guarantees the test's precondition.
    await this.page.context().clearCookies({
      name: /^(?:__Secure-)?authjs\.session-token$/,
    });
  }
}
