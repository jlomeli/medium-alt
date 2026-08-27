import { test, expect } from "@e2e/support/fixtures";
import { RegisterPage } from "@e2e/support/pom/register.page";
import { HeaderComponent } from "@e2e/support/pom/header.component";

/**
 * Acceptance criteria from docs/specs/auth.md → Register.
 *
 * All tests are currently RED — the routes don't exist yet. That's the point
 * of the TDD loop: these tests are the executable spec, and implementation is
 * done when every `expect` passes.
 */

test.describe("@regression register", () => {
  test("@smoke happy path — creates the user and lands on /", async ({ page, userFactory }) => {
    const register = new RegisterPage(page);
    const header = new HeaderComponent(page);
    const attrs = userFactory.build();

    await register.goto();
    await expect(register.heading).toBeVisible();

    await register.fill(attrs);
    await register.submit();

    await expect(page).toHaveURL("/");
    await expect(header.accountMenuButton).toBeVisible();
    await expect(header.logInLink).toHaveCount(0);
  });

  test("duplicate email surfaces an inline error and does not create a user", async ({
    page,
    userFactory,
  }) => {
    const existing = await userFactory.create();
    const register = new RegisterPage(page);

    await register.goto();
    await register.fill({
      ...userFactory.build(),
      email: existing.email,
    });
    await register.submit();

    await expect(page.getByRole("alert")).toContainText(/email .* already registered/i);
    await expect(page).toHaveURL(/\/register/);
  });

  test("duplicate username surfaces an inline error", async ({ page, userFactory }) => {
    const existing = await userFactory.create();
    const register = new RegisterPage(page);

    await register.goto();
    await register.fill({
      ...userFactory.build(),
      username: existing.username,
    });
    await register.submit();

    await expect(page.getByRole("alert")).toContainText(/username .* taken/i);
    await expect(page).toHaveURL(/\/register/);
  });

  test("weak password surfaces a field-level error and does not submit", async ({
    page,
    userFactory,
  }) => {
    const register = new RegisterPage(page);
    const attrs = userFactory.build({ password: "short" });

    await register.goto();
    await register.fill(attrs);
    await register.submit();

    await expect(page.getByRole("alert")).toContainText(
      /password .* (?:at least 8|upper|lower|digit)/i,
    );
    await expect(page).toHaveURL(/\/register/);
  });

  test("malformed email surfaces a field-level error", async ({ page, userFactory }) => {
    const register = new RegisterPage(page);
    const attrs = userFactory.build({ email: "not-an-email" });

    await register.goto();
    await register.fill(attrs);
    await register.submit();

    await expect(page.getByRole("alert")).toContainText(/email .* invalid/i);
    await expect(page).toHaveURL(/\/register/);
  });
});
