import type { Page } from "@playwright/test";
import { BasePage } from "./base.page";

/**
 * `/` — the global feed home page. As of slice 5 (docs/specs/tags-feed.md
 * § UI surface), the home page is the published-articles feed with a
 * popular-tags sidebar; the earlier "Medium-Alt / A writing platform
 * under construction" placeholder is gone.
 */
export class HomePage extends BasePage {
  readonly url = "/";

  readonly heading;
  readonly popularTagsHeading;

  constructor(page: Page) {
    super(page);
    // `<h1>Latest articles</h1>` in the default (no `?tag=`) view.
    this.heading = this.page.getByRole("heading", {
      level: 1,
      name: "Latest articles",
    });
    this.popularTagsHeading = this.page.getByRole("heading", {
      name: "Popular tags",
    });
  }
}
