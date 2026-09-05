import { test, expect } from "@e2e/support/fixtures";
import { HeaderComponent } from "@e2e/support/pom/header.component";
import { UserFactory } from "@e2e/support/factories/user.factory";

/**
 * Acceptance criteria from docs/specs/signed-in-nav.md.
 *
 * Covers both branches of the Header session-shape split:
 *   - Signed-in visitors get a "Write" primary-CTA link in the header
 *     and three dashboard menuitems (Your profile / Your articles /
 *     Settings) inside the AccountMenu, above the existing Log out.
 *   - Anonymous visitors see the unchanged Log in / Sign up fallback.
 *
 * Keyboard coverage is intentionally minimal (one representative
 * flow) — the enumerated APG keys (Home / End / Escape / wrap /
 * Tab exit) are unit-tested on the menu primitive per the spec's
 * § Acceptance criteria — Keyboard.
 */

test.describe("@smoke @regression signed-in header nav", () => {
  test.describe("Write link", () => {
    test("@smoke visible for signed-in visitors and navigates to /articles/new", async ({
      loggedInPage,
    }) => {
      const header = new HeaderComponent(loggedInPage);

      await loggedInPage.goto("/");

      await expect(header.writeLink).toBeVisible();
      await header.writeLink.click();

      await expect(loggedInPage).toHaveURL("/articles/new");
    });

    test("not visible for anonymous visitors", async ({ page }) => {
      const header = new HeaderComponent(page);

      await page.goto("/");

      await expect(header.writeLink).toHaveCount(0);
      // Fallback is unchanged.
      await expect(header.logInLink).toBeVisible();
      await expect(header.signUpLink).toBeVisible();
    });

    test("is SSR-visible (rendered in the initial HTML, not client-only)", async ({
      browser,
      baseURL,
    }) => {
      // A JS-disabled context is the definitive proof of SSR: no hydration
      // can run, so anything visible was in the server response. The
      // acceptance criterion is that an anonymous visitor never briefly
      // sees a stale "Write" link flash before hydration decides they
      // aren't logged in — inverted here: a signed-in visitor DOES see
      // the link even without JS.
      const context = await browser.newContext({ baseURL, javaScriptEnabled: false });
      try {
        const factory = new UserFactory(context.request);
        const user = await factory.create();

        // Manual session-cookie install via the credentials handshake —
        // mirrors the `loggedInPage` fixture, but scoped to this JS-off
        // context. Cannot reuse the fixture because it always spawns a
        // JS-on page.
        const csrfRes = await context.request.get("/api/auth/csrf");
        const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
        await context.request.post("/api/auth/callback/credentials", {
          form: { csrfToken, email: user.email, password: user.password },
          maxRedirects: 0,
        });

        const page = await context.newPage();
        await page.goto("/");
        const header = new HeaderComponent(page);
        await expect(header.writeLink).toBeVisible();
      } finally {
        await context.close();
      }
    });
  });

  test.describe("AccountMenu items", () => {
    test("@smoke lists Your profile / Your articles / Settings / Log out in order", async ({
      loggedInPage,
    }) => {
      const header = new HeaderComponent(loggedInPage);

      await loggedInPage.goto("/");
      await header.openMenu();

      // Order comes from the DOM order of menuitems inside the open menu.
      const labels = await header.menu.getByRole("menuitem").allTextContents();
      expect(labels.map((l) => l.trim())).toEqual([
        "Your profile",
        "Your articles",
        "Settings",
        "Log out",
      ]);
    });

    test("Your profile navigates to /me", async ({ loggedInPage }) => {
      const header = new HeaderComponent(loggedInPage);
      await loggedInPage.goto("/");
      await header.openMenu();

      await header.yourProfileMenuItem.click();

      await expect(loggedInPage).toHaveURL("/me");
    });

    test("Your articles navigates to /me/articles", async ({ loggedInPage }) => {
      const header = new HeaderComponent(loggedInPage);
      await loggedInPage.goto("/");
      await header.openMenu();

      await header.yourArticlesMenuItem.click();

      await expect(loggedInPage).toHaveURL("/me/articles");
    });

    test("Settings navigates to /me/edit", async ({ loggedInPage }) => {
      const header = new HeaderComponent(loggedInPage);
      await loggedInPage.goto("/");
      await header.openMenu();

      await header.settingsMenuItem.click();

      await expect(loggedInPage).toHaveURL("/me/edit");
    });

    test("clicking outside the menu closes it", async ({ loggedInPage }) => {
      const header = new HeaderComponent(loggedInPage);
      await loggedInPage.goto("/");
      await header.openMenu();
      await expect(header.menu).toBeVisible();

      // Click somewhere in the page body outside the menu.
      await loggedInPage.mouse.click(10, 400);

      await expect(header.menu).toHaveCount(0);
      await expect(header.accountMenuButton).toHaveAttribute("aria-expanded", "false");
    });

    test("clicking a menuitem link closes the menu after navigation", async ({
      loggedInPage,
    }) => {
      const header = new HeaderComponent(loggedInPage);
      await loggedInPage.goto("/");
      await header.openMenu();

      await header.yourProfileMenuItem.click();
      await expect(loggedInPage).toHaveURL("/me");

      // After navigation, the toggle is still in the DOM (Header is in the
      // app layout — no remount), so `aria-expanded` MUST be re-derived to
      // "false" by the component's close-on-navigate handler. Menu is out.
      await expect(header.accountMenuButton).toHaveAttribute("aria-expanded", "false");
      await expect(header.menu).toHaveCount(0);
    });
  });

  test.describe("Keyboard", () => {
    test("Enter on toggle opens the menu, focus lands on first menuitem, Enter navigates", async ({
      loggedInPage,
    }) => {
      const header = new HeaderComponent(loggedInPage);
      await loggedInPage.goto("/");

      await header.accountMenuButton.focus();
      await loggedInPage.keyboard.press("Enter");

      // First menuitem is `Your profile`. Focus is programmatically moved
      // there by the menu-widget open handler (roving tabindex).
      await expect(header.yourProfileMenuItem).toBeFocused();

      await loggedInPage.keyboard.press("Enter");
      await expect(loggedInPage).toHaveURL("/me");
    });
  });

  test.describe("Anonymous fallback", () => {
    test("no Write link, no AccountMenu — only Log in / Sign up", async ({ page }) => {
      const header = new HeaderComponent(page);

      await page.goto("/");

      await expect(header.writeLink).toHaveCount(0);
      await expect(header.accountMenuButton).toHaveCount(0);
      await expect(header.logInLink).toBeVisible();
      await expect(header.signUpLink).toBeVisible();
    });
  });
});
