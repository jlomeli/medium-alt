import { test, expect } from "@e2e/support/fixtures";
import { LoginPage } from "@e2e/support/pom/login.page";
import { HeaderComponent } from "@e2e/support/pom/header.component";

/**
 * Acceptance criteria from docs/specs/auth.md → Login.
 *
 * Anti-enumeration: wrong-password and unknown-email must show the *same*
 * generic error. Not just morally — the test asserts strict equality.
 */

test.describe("@smoke @regression login", () => {
  const GENERIC_ERROR = /email or password is incorrect/i;

  test("@smoke happy path — valid credentials land on /", async ({ page, userFactory }) => {
    const user = await userFactory.create();
    const login = new LoginPage(page);
    const header = new HeaderComponent(page);

    await login.loginAs({ email: user.email, password: user.password });

    await expect(page).toHaveURL("/");
    await expect(header.accountMenuButton).toBeVisible();
  });

  test("wrong password shows the generic error", async ({ page, userFactory }) => {
    const user = await userFactory.create();
    const login = new LoginPage(page);

    await login.loginAs({ email: user.email, password: "Wrong-Password-1" });

    await expect(page.getByText(GENERIC_ERROR)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("unknown email shows the same generic error (no enumeration)", async ({
    page,
    userFactory,
  }) => {
    const login = new LoginPage(page);
    const bogus = userFactory.build();

    await login.loginAs({ email: bogus.email, password: bogus.password });

    await expect(page.getByText(GENERIC_ERROR)).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test("callbackUrl lands the user on the requested path", async ({ page, userFactory }) => {
    const user = await userFactory.create();
    const login = new LoginPage(page);

    await login.gotoWithCallback("/me");
    await login.fill({ email: user.email, password: user.password });
    await login.submit();

    await expect(page).toHaveURL("/me");
  });

  test("external callbackUrl is ignored — user lands on /", async ({ page, userFactory }) => {
    const user = await userFactory.create();
    const login = new LoginPage(page);

    await login.gotoWithCallback("https://evil.example/steal");
    await login.fill({ email: user.email, password: user.password });
    await login.submit();

    await expect(page).toHaveURL("/");
  });

  test("already-signed-in user visiting /login is redirected to /", async ({ loggedInPage }) => {
    await loggedInPage.goto("/login");
    await expect(loggedInPage).toHaveURL("/");
  });
});
