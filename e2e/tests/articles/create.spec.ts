import { test, expect } from "@e2e/support/fixtures";
import { ArticleFormPage } from "@e2e/support/pom/article-form.page";

/** Acceptance criteria from docs/specs/articles-crud.md → Create. */

test.describe("@smoke @regression create article", () => {
  test("signed-in visitor sees the new-article form", async ({ loggedInPage }) => {
    const form = new ArticleFormPage(loggedInPage);
    await form.gotoNew();

    await expect(form.newHeading).toBeVisible();
    await expect(form.titleField).toBeVisible();
    await expect(form.subtitleField).toBeVisible();
    await expect(form.bodyEditor).toBeVisible();
    await expect(form.toolbar).toBeVisible();
    await expect(form.publishedCheckbox).toBeVisible();
    await expect(form.publishedCheckbox).not.toBeChecked();
  });

  test("valid inputs unpublished → creates draft + lands on /articles/[slug]/edit", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const form = new ArticleFormPage(loggedInPage);
    const attrs = articleFactory.build({ published: false });
    await form.gotoNew();
    await form.fill(attrs);
    await form.submit();

    await expect(loggedInPage).toHaveURL(/\/articles\/[a-z0-9-]+\/edit$/);
    await expect(form.editHeading).toBeVisible();
  });

  test("valid inputs published → publishes immediately + lands on /articles/[slug]", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const form = new ArticleFormPage(loggedInPage);
    const attrs = articleFactory.build({ published: true });
    await form.gotoNew();
    await form.fill(attrs);
    await form.submit();

    // /articles/<slug> — no /edit suffix; the page's h1 shows the title.
    await expect(loggedInPage).toHaveURL(/\/articles\/[a-z0-9-]+$/);
    await expect(loggedInPage.getByRole("heading", { level: 1, name: attrs.title })).toBeVisible();
  });

  test("signed-out visitor is redirected to /login with callbackUrl", async ({ page }) => {
    await page.goto("/articles/new");
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Farticles%2Fnew/);
  });

  test("missing title surfaces a field-level Zod error inline", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const form = new ArticleFormPage(loggedInPage);
    const attrs = articleFactory.build();
    await form.gotoNew();
    await form.fill({ ...attrs, title: "" });
    await form.submit();

    await expect(loggedInPage.getByText(/title.* required|title must/i)).toBeVisible();
    await expect(loggedInPage).toHaveURL(/\/articles\/new/);
  });

  test("body over max serialized size surfaces a field-level error", async ({
    loggedInPage,
    articleFactory,
  }) => {
    // 4b caps the body at 40k serialized JSON bytes (see
    // docs/specs/articles-editor.md § Validation). A single-paragraph
    // doc with 40 001 chars of text serializes to just above that cap
    // once node/mark overhead is added.
    const form = new ArticleFormPage(loggedInPage);
    const attrs = articleFactory.build({ body: "x".repeat(40_001) });
    await form.gotoNew();
    await form.fill(attrs);
    await form.submit();

    await expect(loggedInPage.getByText(/body.*too (long|large)|body must be at most/i)).toBeVisible();
    await expect(loggedInPage).toHaveURL(/\/articles\/new/);
  });
});
