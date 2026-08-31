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
    // Exact match — "Subtitle" would otherwise also match a non-exact
    // `getByLabel("Title")` and produce a strict-mode violation.
    this.titleField = this.page.getByLabel("Title", { exact: true });
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

  /**
   * Click "Delete article" and wait for the DELETE response before
   * returning — same rationale as `submit()`: callers can immediately
   * follow up with a verification GET without racing an in-flight write.
   * The caller is responsible for wiring `page.once("dialog", ...)` to
   * accept the `window.confirm()` before invoking.
   */
  async delete(): Promise<void> {
    await Promise.all([
      this.page.waitForResponse(
        (res) =>
          /\/api\/articles\/[^/?]+$/.test(new URL(res.url()).pathname) &&
          res.request().method() === "DELETE",
      ),
      this.deleteButton.click(),
    ]);
  }

  async submit(): Promise<void> {
    // Race the two possible outcomes:
    //   - happy path: the underlying POST/PATCH completes;
    //   - client-side reject: the schema fires before any request goes out,
    //     and an inline `role="alert"` renders.
    // Waiting for either lets happy-path callers avoid a browser navigation
    // cancelling the in-flight fetch AND avoids hanging on the client-only
    // failure paths where no network call is ever made.
    const alertCountBefore = await this.page.getByRole("alert").count();
    const network = this.page.waitForResponse(
      (res) =>
        /\/api\/articles(\/[^/?]+)?$/.test(new URL(res.url()).pathname) &&
        ["POST", "PATCH"].includes(res.request().method()),
    );
    const newAlert = this.page
      .locator(`role=alert >> nth=${alertCountBefore}`)
      .waitFor({ state: "visible" });
    await this.saveButton.click();
    await Promise.race([network, newAlert]);
  }
}
