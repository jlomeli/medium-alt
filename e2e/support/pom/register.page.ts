import type { Page } from "@playwright/test";
import { BasePage } from "./base.page";

/**
 * Page Object for `/register`.
 *
 * Every field is queried by role/label so the *markup* is the accessibility
 * contract — no data-testids. Inline errors are surfaced as `role="alert"`
 * elements; tests match on the message text since each error message is
 * distinct per acceptance criterion. See docs/CODING_STANDARDS.md §Testing.
 */
export class RegisterPage extends BasePage {
  readonly url = "/register";

  readonly heading;
  readonly emailField;
  readonly usernameField;
  readonly passwordField;
  readonly nameField;
  readonly submitButton;
  readonly loginLink;

  constructor(page: Page) {
    super(page);
    this.heading = this.page.getByRole("heading", { name: "Create your account" });
    this.emailField = this.page.getByLabel("Email");
    this.usernameField = this.page.getByLabel("Username");
    this.passwordField = this.page.getByLabel("Password", { exact: true });
    this.nameField = this.page.getByLabel(/name \(optional\)/i);
    this.submitButton = this.page.getByRole("button", { name: "Create account" });
    this.loginLink = this.page.getByRole("link", { name: "Log in" });
  }

  async fill(input: {
    email: string;
    username: string;
    password: string;
    name?: string;
  }): Promise<void> {
    await this.emailField.fill(input.email);
    await this.usernameField.fill(input.username);
    await this.passwordField.fill(input.password);
    if (input.name) await this.nameField.fill(input.name);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }
}
