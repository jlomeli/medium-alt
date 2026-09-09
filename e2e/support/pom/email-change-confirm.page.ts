import type { Page } from "@playwright/test";
import { BasePage } from "./base.page";

/**
 * Page Object for `/settings/email/confirm?token=…`.
 *
 * The confirm page has three terminal states after the POST — success,
 * `invalid` (unknown / expired / reused / malformed collapse), and
 * `in-use` — plus the idle click-through form. The POM exposes each
 * as its own locator so tests read as `expect(page.invalidAlert)…`
 * rather than "find the alert and match a regex against its text."
 */
export class EmailChangeConfirmPage extends BasePage {
  readonly url = "/settings/email/confirm";

  readonly heading;
  readonly form;
  readonly confirmButton;
  readonly successStatus;
  readonly invalidAlert;
  readonly inUseAlert;

  constructor(page: Page) {
    super(page);
    this.heading = this.page.getByRole("heading", { name: "Confirm email change" });
    this.form = this.page.getByRole("form", { name: "Confirm email change" });
    this.confirmButton = this.form.getByRole("button", { name: "Confirm email change" });
    // The success indicator sits outside the form after the POST resolves.
    this.successStatus = this.page.getByRole("status");
    // `getByRole('alert')` picks up the `<p role="alert">` copy. Text
    // filters distinguish between the collapsed invalid/expired branch
    // and the 409 in-use branch — both live under the same role.
    this.invalidAlert = this.page
      .getByRole("alert")
      .filter({ hasText: /no longer valid or has expired/i });
    this.inUseAlert = this.page
      .getByRole("alert")
      .filter({ hasText: /now in use by another account/i });
  }

  async gotoWithToken(token: string): Promise<void> {
    await this.page.goto(`${this.url}?token=${encodeURIComponent(token)}`);
  }

  async confirm(): Promise<void> {
    await this.confirmButton.click();
  }
}
