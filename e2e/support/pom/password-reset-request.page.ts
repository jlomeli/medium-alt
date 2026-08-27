import type { Page } from "@playwright/test";
import { BasePage } from "./base.page";

/**
 * Page Object for `/password-reset/request`.
 *
 * The response is always the same generic "check your email" state — this is
 * the anti-enumeration surface described in docs/specs/auth.md.
 */
export class PasswordResetRequestPage extends BasePage {
  readonly url = "/password-reset/request";

  readonly heading;
  readonly emailField;
  readonly submitButton;

  /** Post-submit confirmation shown for both known and unknown emails. */
  readonly confirmationHeading;

  constructor(page: Page) {
    super(page);
    this.heading = this.page.getByRole("heading", { name: "Reset your password" });
    this.emailField = this.page.getByLabel("Email");
    this.submitButton = this.page.getByRole("button", { name: "Send reset link" });
    this.confirmationHeading = this.page.getByRole("heading", { name: "Check your email" });
  }

  async requestFor(email: string): Promise<void> {
    await this.goto();
    await this.emailField.fill(email);
    await this.submitButton.click();
  }
}
