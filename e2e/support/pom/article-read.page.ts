import type { Page } from "@playwright/test";
import { BasePage } from "./base.page";

/**
 * Page Object for `/articles/[slug]` — the public read view.
 */
export class ArticleReadPage extends BasePage {
  readonly url = "/articles";

  readonly titleHeading;
  readonly subtitle;
  readonly body;
  readonly authorLine;
  readonly draftBadge;
  readonly editLink;

  constructor(page: Page) {
    super(page);
    // Title is the h1 on the article page.
    this.titleHeading = this.page.getByRole("heading", { level: 1 });
    this.subtitle = this.page.getByRole("region", { name: "Subtitle" });
    this.body = this.page.getByRole("region", { name: "Body" });
    this.authorLine = this.page.getByRole("region", { name: "Author" });
    this.draftBadge = this.page.getByText("Draft", { exact: true });
    this.editLink = this.page.getByRole("link", { name: "Edit" });
  }

  async gotoSlug(slug: string): Promise<void> {
    await this.page.goto(`/articles/${slug}`);
  }
}
