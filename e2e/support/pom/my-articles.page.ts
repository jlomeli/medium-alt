import type { Page } from "@playwright/test";
import { BasePage } from "./base.page";

/**
 * Page Object for `/me/articles` — the signed-in user's own articles list.
 *
 * The list is a semantic table so tests can query rows / cells naturally.
 */
export class MyArticlesPage extends BasePage {
  readonly url = "/me/articles";

  readonly heading;
  readonly table;

  constructor(page: Page) {
    super(page);
    this.heading = this.page.getByRole("heading", { name: "Your articles" });
    this.table = this.page.getByRole("table", { name: "Your articles" });
  }

  /** Row matching the given article title (matches within the table). */
  rowFor(title: string) {
    return this.table.getByRole("row", { name: new RegExp(title, "i") });
  }
}
