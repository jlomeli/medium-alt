import type { Page } from "@playwright/test";
import { BasePage } from "./base.page";

/**
 * Page Object for `/me/edit`.
 *
 * The page composes three independent sections — profile, change
 * password, change email — each with its own `<form>` and its own
 * submit state. The POM groups locators the same way so tests can
 * name the section they mean (`page.password.currentField`) rather
 * than reach for ambiguous top-level labels ("New password" could
 * live in either the password OR the email section if you squint).
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

  readonly password;
  readonly email;

  constructor(page: Page) {
    super(page);
    this.heading = this.page.getByRole("heading", { name: "Edit profile" });
    this.nameField = this.page.getByLabel(/^name/i);
    this.usernameField = this.page.getByLabel("Username");
    this.bioField = this.page.getByLabel("Bio");
    this.saveButton = this.page.getByRole("button", { name: "Save changes" });
    this.cancelLink = this.page.getByRole("link", { name: "Cancel" });

    this.password = new ChangePasswordSection(page);
    this.email = new ChangeEmailSection(page);
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

/**
 * `/me/edit` § Change password. Locators are scoped to the section's
 * form so labels don't collide with the profile form's fields.
 */
export class ChangePasswordSection {
  readonly heading;
  readonly form;
  readonly currentField;
  readonly newField;
  readonly confirmField;
  readonly submitButton;
  readonly successStatus;

  constructor(page: Page) {
    this.heading = page.getByRole("heading", { name: "Change password" });
    this.form = page.getByRole("form", { name: "Change password" });
    // `exact: true` on "New password" — the substring default also
    // matches "Confirm new password".
    this.currentField = this.form.getByLabel("Current password");
    this.newField = this.form.getByLabel("New password", { exact: true });
    this.confirmField = this.form.getByLabel("Confirm new password");
    this.submitButton = this.form.getByRole("button", { name: "Change password" });
    this.successStatus = this.form.getByRole("status");
  }

  async fill(input: {
    current?: string;
    next?: string;
    confirm?: string;
  }): Promise<void> {
    if (input.current !== undefined) await this.currentField.fill(input.current);
    if (input.next !== undefined) await this.newField.fill(input.next);
    if (input.confirm !== undefined) await this.confirmField.fill(input.confirm);
  }

  async submit(): Promise<void> {
    await this.submitButton.click();
  }
}

/**
 * `/me/edit` § Change email. Renders both the pending banner and the
 * input form when a pending row exists — the pending-state locators
 * live on the section body (they're outside the form), while the
 * input/submit locators are scoped to the form.
 */
export class ChangeEmailSection {
  readonly heading;
  readonly form;
  readonly newField;
  readonly submitButton;
  readonly pendingBanner;
  readonly resendButton;
  readonly cancelButton;
  readonly formStatus;

  constructor(page: Page) {
    this.heading = page.getByRole("heading", { name: "Change email" });
    this.form = page.getByRole("form", { name: "Change email" });
    this.newField = this.form.getByLabel("New email");
    this.submitButton = this.form.getByRole("button", { name: "Send verification" });
    this.formStatus = this.form.getByRole("status");

    // The pending banner is a sibling of the form, not inside it — scope
    // via the "Pending" text so we don't accidentally match the form's
    // status message ("Verification sent to …").
    this.pendingBanner = page.getByText(/^Pending:/);
    this.resendButton = page.getByRole("button", { name: "Resend verification" });
    this.cancelButton = page.getByRole("button", { name: "Cancel change" });
  }

  async submitNew(email: string): Promise<void> {
    await this.newField.fill(email);
    await this.submitButton.click();
  }
}
