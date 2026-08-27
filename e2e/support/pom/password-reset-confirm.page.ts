import type { Page } from "@playwright/test";
import { BasePage } from "./base.page";

/**
 * Page Object for `/password-reset/confirm?token=...`.
 *
 * On success the user is auto-signed in and redirected to `/`. On expired /
 * invalid / already-used tokens the page renders a `role="alert"` error and no
 * form.
 */
export class PasswordResetConfirmPage extends BasePage {
  readonly url = "/password-reset/confirm";

  readonly heading;
  readonly newPasswordField;
  readonly confirmPasswordField;
  readonly submitButton;

  constructor(page: Page) {
    super(page);
    this.heading = this.page.getByRole("heading", { name: "Set a new password" });
    this.newPasswordField = this.page.getByLabel("New password", { exact: true });
    this.confirmPasswordField = this.page.getByLabel("Confirm new password");
    this.submitButton = this.page.getByRole("button", { name: "Update password" });
  }

  async gotoWithToken(token: string): Promise<void> {
    await this.page.goto(`${this.url}?token=${encodeURIComponent(token)}`);
  }

  async fillAndSubmit(newPassword: string): Promise<void> {
    await this.newPasswordField.fill(newPassword);
    await this.confirmPasswordField.fill(newPassword);
    await this.submitButton.click();
  }
}
