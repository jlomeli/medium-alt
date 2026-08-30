import type { Page } from "@playwright/test";
import { BasePage } from "./base.page";

/**
 * Page Object for the article form — used by both `/articles/new` and
 * `/articles/[slug]/edit`. The two URLs share the same field layout, so
 * one POM handles both; `.gotoNew()` and `.gotoEdit(slug)` pick the
 * navigation target.
 */
export class ArticleFormPage extends BasePage {
  readonly url = "/articles/new";

  readonly newHeading;
  readonly editHeading;
  readonly titleField;
  readonly subtitleField;
  readonly bodyField;
  readonly publishedCheckbox;
  readonly saveButton;
  readonly deleteButton;

  constructor(page: Page) {
    super(page);
    this.newHeading = this.page.getByRole("heading", { name: "New article" });
    this.editHeading = this.page.getByRole("heading", { name: "Edit article" });
    this.titleField = this.page.getByLabel("Title");
    this.subtitleField = this.page.getByLabel(/^subtitle/i);
    this.bodyField = this.page.getByLabel("Body");
    this.publishedCheckbox = this.page.getByRole("checkbox", {
      name: "Publish this article",
    });
    this.saveButton = this.page.getByRole("button", { name: /^(save|publish)/i });
    // Delete only appears on the edit page.
    this.deleteButton = this.page.getByRole("button", { name: "Delete article" });
  }

  async gotoNew(): Promise<void> {
    await this.page.goto("/articles/new");
  }

  async gotoEdit(slug: string): Promise<void> {
    await this.page.goto(`/articles/${slug}/edit`);
  }

  async fill(input: {
    title?: string;
    subtitle?: string;
    body?: string;
    published?: boolean;
  }): Promise<void> {
    if (input.title !== undefined) await this.titleField.fill(input.title);
    if (input.subtitle !== undefined) await this.subtitleField.fill(input.subtitle);
    if (input.body !== undefined) await this.bodyField.fill(input.body);
    if (input.published !== undefined) {
      if (input.published) await this.publishedCheckbox.check();
      else await this.publishedCheckbox.uncheck();
    }
  }

  async submit(): Promise<void> {
    await this.saveButton.click();
  }
}
