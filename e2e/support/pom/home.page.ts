import type { Page } from "@playwright/test";
import { BasePage } from "./base.page";

export class HomePage extends BasePage {
  readonly url = "/";

  readonly heading;
  readonly tagline;

  constructor(page: Page) {
    super(page);
    this.heading = this.page.getByRole("heading", { name: "Medium-Alt" });
    this.tagline = this.page.getByText("A writing platform under construction");
  }
}
