import type { Page } from "@playwright/test";
import { BasePage } from "./base.page";

/**
 * Page Object for `/me/edit`.
 *
 * `nameField` uses a regex so the label can carry an "(optional)" hint
 * without the test rebinding.
 */
export class EditProfilePage extends BasePage {
  readonly url = "/me/edit";

  readonly heading;
  readonly nameField;
  readonly usernameField;
  readonly bioField;
  readonly saveButton;
  readonly cancelLink;

  constructor(page: Page) {
    super(page);
    this.heading = this.page.getByRole("heading", { name: "Edit profile" });
    this.nameField = this.page.getByLabel(/^name/i);
    this.usernameField = this.page.getByLabel("Username");
    this.bioField = this.page.getByLabel("Bio");
    this.saveButton = this.page.getByRole("button", { name: "Save changes" });
    this.cancelLink = this.page.getByRole("link", { name: "Cancel" });
  }

  async fill(input: { name?: string; username?: string; bio?: string }): Promise<void> {
    if (input.name !== undefined) await this.nameField.fill(input.name);
    if (input.username !== undefined) await this.usernameField.fill(input.username);
    if (input.bio !== undefined) await this.bioField.fill(input.bio);
  }

  async submit(): Promise<void> {
    await this.saveButton.click();
  }
}
