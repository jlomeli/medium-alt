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
  // Slice 8 — comments. `commentsRegion` scopes queries so the same
  // accessible names ("Post comment", "Write a comment", per-item
  // "Delete your comment posted <time>") stay unambiguous even when a
  // future slice adds a global commentary panel.
  readonly commentsRegion;
  readonly commentsHeading;
  readonly commentForm;
  readonly commentTextarea;
  readonly commentSubmit;
  readonly commentError;
  readonly commentList;
  readonly signInToCommentLink;

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

    // Comments — see docs/specs/comments.md § UI surface. The section
    // is a `<section aria-labelledby="comments-heading">` with a `<h2
    // id="comments-heading">Comments (N)</h2>` inside it, so the
    // region's accessible name is "Comments (N)" — a `/^Comments/`
    // pattern keeps the locator robust as N changes.
    this.commentsRegion = this.page.getByRole("region", {
      name: /^Comments/,
    });
    this.commentsHeading = this.commentsRegion.getByRole("heading", {
      level: 2,
      name: /^Comments/,
    });
    this.commentForm = this.commentsRegion.getByRole("form", {
      name: "Post a comment",
    });
    this.commentTextarea = this.commentForm.getByRole("textbox", {
      name: "Write a comment",
    });
    this.commentSubmit = this.commentForm.getByRole("button", {
      name: "Post comment",
    });
    // Zod / server-side validation surfaces in a role="alert" sibling
    // to the textarea (also announced on insertion).
    this.commentError = this.commentForm.getByRole("alert");
    // The list is a `<ul>` / `<ol>` — assertions on ordering and
    // membership go through .getByRole('listitem') off this locator.
    this.commentList = this.commentsRegion.getByRole("list");
    // Anonymous fallback renders as a link (not a button), same
    // pattern as ClapButton variant="anonymous".
    this.signInToCommentLink = this.commentsRegion.getByRole("link", {
      name: /^Sign in or sign up to leave a comment/,
    });
  }

  /**
   * A single comment card, scoped by its author's display name.
   * Returned as a listitem locator so callers can further chain
   * `.getByRole("button", { name: /^Delete your comment/ })` off it
   * without accidentally matching a delete button on a different row.
   */
  commentItemByAuthor(authorName: string) {
    return this.commentList
      .getByRole("listitem")
      .filter({ hasText: authorName });
  }

  async gotoSlug(slug: string): Promise<void> {
    await this.page.goto(`/articles/${slug}`);
  }
}
