import type { Page } from "@playwright/test";
import { BasePage } from "./base.page";

/**
 * Page Object for `/api/docs` — the Scalar-rendered API reference.
 *
 * The page's heading is derived from the OpenAPI document's `info.title`,
 * which is emitted by the same generator the API tests hit. `.heading` uses
 * an accessible-name-neutral query so the test doesn't rebind if we ever
 * rename the API in `info.title`.
 */
export class ApiDocsPage extends BasePage {
  readonly url = "/api/docs";

  readonly heading;

  constructor(page: Page) {
    super(page);
    this.heading = this.page.getByRole("heading", { level: 1 });
  }
}
