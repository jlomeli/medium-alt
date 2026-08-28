import type { Page } from "@playwright/test";
import { BasePage } from "./base.page";

/**
 * Page Object for `/login`.
 *
 * Honors `?callbackUrl=...`. Same accessibility contract as RegisterPage.
 * See docs/CODING_STANDARDS.md §Testing.
 */
export class LoginPage extends BasePage {
  readonly url = "/login";

  readonly heading;
  readonly emailField;
  readonly passwordField;
  readonly submitButton;
  readonly forgotPasswordLink;
  readonly registerLink;

  constructor(page: Page) {
    super(page);
    this.heading = this.page.getByRole("heading", { name: "Log in to Medium-Alt" });
    this.emailField = this.page.getByLabel("Email");
    this.passwordField = this.page.getByLabel("Password", { exact: true });
    this.submitButton = this.page.getByRole("button", { name: "Log in" });
    this.forgotPasswordLink = this.page.getByRole("link", { name: "Forgot password?" });
    this.registerLink = this.page.getByRole("link", { name: "Sign up" });
  }

  async gotoWithCallback(callbackUrl: string): Promise<void> {
    await this.page.goto(`${this.url}?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  async fill(input: { email: string; password: string }): Promise<void> {
    await this.emailField.fill(input.email);
    await this.passwordField.fill(input.password);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }

  async loginAs(user: { email: string; password: string }): Promise<void> {
    await this.goto();
    await this.fill(user);
    await this.submit();
  }
}
