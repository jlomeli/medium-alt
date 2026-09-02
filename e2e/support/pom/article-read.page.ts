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
  // Slice 7 — claps. `clapRegion` scopes queries to the clap affordance
  // block so the same accessible names ("Clap for this article", the
  // total-count text) don't collide with anything else on the page.
  // `clapButton` is the signed-in <button>; `clapLink` is the anonymous
  // <a> that bounces through /login. Both share the accessible name
  // "Clap for this article" (with a count inside).
  readonly clapRegion;
  readonly clapButton;
  readonly clapLink;
  readonly clapTotal;
  readonly clapError;

  constructor(page: Page) {
    super(page);
    // Title is the h1 on the article page.
    this.titleHeading = this.page.getByRole("heading", { level: 1 });
    this.subtitle = this.page.getByRole("region", { name: "Subtitle" });
    this.body = this.page.getByRole("region", { name: "Body" });
    this.authorLine = this.page.getByRole("region", { name: "Author" });
    this.draftBadge = this.page.getByText("Draft", { exact: true });
    this.editLink = this.page.getByRole("link", { name: "Edit" });

    // Clap affordance — see docs/specs/claps.md § UI surface. The block
    // is a `<section aria-label="Claps">` so we can scope reads without
    // guessing at DOM structure.
    this.clapRegion = this.page.getByRole("region", { name: "Claps" });
    this.clapButton = this.clapRegion.getByRole("button", {
      name: /^Clap for this article/,
    });
    this.clapLink = this.clapRegion.getByRole("link", {
      name: /^Clap for this article/,
    });
    // The total is a `<span aria-label="Total claps">42</span>` inside
    // the region — accessible name lets us assert on the number without
    // reaching for a testid.
    this.clapTotal = this.clapRegion.getByLabel("Total claps");
    // Optimistic-UI error surfaces here on POST failure. `role="alert"`
    // is announced to screen readers on insertion.
    this.clapError = this.clapRegion.getByRole("alert");
  }

  async gotoSlug(slug: string): Promise<void> {
    await this.page.goto(`/articles/${slug}`);
  }
}
