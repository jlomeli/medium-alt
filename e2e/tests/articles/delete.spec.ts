import { test, expect } from "@e2e/support/fixtures";
import { ArticleFormPage } from "@e2e/support/pom/article-form.page";
import { MyArticlesPage } from "@e2e/support/pom/my-articles.page";

/**
 * Acceptance criteria from docs/specs/articles-delete-ui.md
 * (supersedes the placeholder from articles-crud.md § Delete).
 *
 * These tests assume the reusable `role="dialog"` ConfirmDialog surface
 * owned by <DeleteArticleButton>. They will fail against the pre-slice
 * implementation, which uses `window.confirm` inside `ArticleForm`; the
 * feature branch removes that path (spec § UI surface).
 */

test.describe("@regression delete article via edit-page dialog", () => {
  test("@smoke @regression draft: dialog → confirm → redirect + row gone", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const draft = await articleFactory.create(loggedInPage.request, { published: false });
    const form = new ArticleFormPage(loggedInPage);

    await form.gotoEdit(draft.slug);
    await form.confirmDelete();

    await expect(loggedInPage).toHaveURL(/\/me\/articles$/);
    const list = new MyArticlesPage(loggedInPage);
    await expect(list.rowFor(draft.title)).toHaveCount(0);
  });

  test("@smoke @regression published: dialog → confirm → redirect + row gone", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const published = await articleFactory.create(loggedInPage.request, { published: true });
    const form = new ArticleFormPage(loggedInPage);

    await form.gotoEdit(published.slug);
    await form.confirmDelete();

    await expect(loggedInPage).toHaveURL(/\/me\/articles$/);
    const list = new MyArticlesPage(loggedInPage);
    await expect(list.rowFor(published.title)).toHaveCount(0);
  });

  test("@smoke @regression cancel affordances (button, Escape, backdrop) close without DELETE", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const article = await articleFactory.create(loggedInPage.request, { published: false });
    const form = new ArticleFormPage(loggedInPage);
    await form.gotoEdit(article.slug);

    // Track every DELETE request against this article's endpoint; the
    // three cancel paths must land ZERO.
    const deleteRequests: string[] = [];
    loggedInPage.on("request", (req) => {
      if (
        req.method() === "DELETE" &&
        new URL(req.url()).pathname === `/api/articles/${article.slug}`
      ) {
        deleteRequests.push(req.url());
      }
    });

    // 1) Cancel button.
    await form.openDeleteDialog();
    await form.deleteConfirmCancelButton.click();
    await expect(form.deleteConfirmDialog).toBeHidden();

    // 2) Escape key.
    await form.openDeleteDialog();
    await loggedInPage.keyboard.press("Escape");
    await expect(form.deleteConfirmDialog).toBeHidden();

    // 3) Backdrop click. The backdrop sits behind the dialog panel; a
    // click at (5, 5) on the page lands on it without hitting the panel.
    await form.openDeleteDialog();
    await loggedInPage.mouse.click(5, 5);
    await expect(form.deleteConfirmDialog).toBeHidden();

    expect(deleteRequests).toEqual([]);
  });

  test("in-flight lockout — button reads 'Deleting…', disabled, no duplicate DELETE", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const article = await articleFactory.create(loggedInPage.request, { published: false });
    const form = new ArticleFormPage(loggedInPage);
    await form.gotoEdit(article.slug);

    // Stall the DELETE so the pending state stays observable. Resolve the
    // request only after we've clicked the (disabled) button a second
    // time and verified the request count.
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let deleteCount = 0;
    await loggedInPage.route(`**/api/articles/${article.slug}`, async (route) => {
      if (route.request().method() !== "DELETE") return route.fallback();
      deleteCount++;
      await gate;
      await route.fulfill({ status: 204 });
    });

    await form.openDeleteDialog();
    await form.deleteConfirmSubmitButton.click();

    // Mid-flight: button label swaps + disabled.
    const deletingButton = form.deleteConfirmDialog.getByRole("button", {
      name: "Deleting…",
    });
    await expect(deletingButton).toBeVisible();
    await expect(deletingButton).toBeDisabled();
    // Outer trigger is also locked out so the user can't reopen mid-request.
    await expect(form.deleteButton).toBeDisabled();

    // A `.click({ force: true })` bypasses actionability and would hit
    // the DOM node even though it's disabled — used here specifically to
    // prove the *disabled state* is what stops the duplicate DELETE,
    // not just Playwright's own actionability check.
    await deletingButton.click({ force: true });

    release();
    await loggedInPage.waitForURL(/\/me\/articles$/);
    expect(deleteCount).toBe(1);
  });

  test("401 mid-flight — dialog surfaces sign-in prompt with callbackUrl", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const article = await articleFactory.create(loggedInPage.request, { published: true });
    const form = new ArticleFormPage(loggedInPage);
    await form.gotoEdit(article.slug);

    // Inject a 401 for the DELETE without touching the real session —
    // exercising the client's response-handling branch directly.
    await loggedInPage.route(`**/api/articles/${article.slug}`, async (route) => {
      if (route.request().method() !== "DELETE") return route.fallback();
      await route.fulfill({ status: 401 });
    });

    await form.openDeleteDialog();
    await form.deleteConfirmSubmitButton.click();

    await expect(form.deleteConfirmDialog).toContainText(
      "Please sign in again to delete this article.",
    );
    await expect(form.deleteErrorSignInLink).toBeVisible();
    const href = await form.deleteErrorSignInLink.getAttribute("href");
    expect(href).toMatch(/^\/login\?callbackUrl=/);
    expect(decodeURIComponent(href!)).toContain(`/articles/${article.slug}/edit`);
  });

  test("concurrent-delete 404 — dialog surfaces already-removed message; OK → /me/articles", async ({
    loggedInPage,
    articleFactory,
    userFactory,
    request,
  }) => {
    // Article owned by the loggedInPage user. Deleted out-of-band before
    // the user clicks Delete — same session, different transport, so no
    // route-mocking is needed to reproduce the 404 branch faithfully.
    const article = await articleFactory.create(loggedInPage.request, { published: false });
    const form = new ArticleFormPage(loggedInPage);
    await form.gotoEdit(article.slug);
    await form.openDeleteDialog();

    // Silent — no thrown pageerror is part of the acceptance criteria.
    const pageErrors: Error[] = [];
    loggedInPage.on("pageerror", (e) => pageErrors.push(e));

    const oob = await loggedInPage.request.delete(`/api/articles/${article.slug}`);
    expect(oob.status()).toBe(204);

    await form.deleteConfirmSubmitButton.click();
    await expect(form.deleteConfirmDialog).toContainText(
      "This article has already been removed.",
    );

    await form.deleteErrorOkButton.click();
    await expect(loggedInPage).toHaveURL(/\/me\/articles$/);
    expect(pageErrors).toEqual([]);

    // Reference unused fixture args so the linter stays quiet without
    // us dropping them (they may be needed if the test grows to seed a
    // second user for the OOB delete).
    void userFactory;
    void request;
  });

  test("server 5xx — dialog surfaces retry copy; button re-enables", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const article = await articleFactory.create(loggedInPage.request, { published: false });
    const form = new ArticleFormPage(loggedInPage);
    await form.gotoEdit(article.slug);

    await loggedInPage.route(`**/api/articles/${article.slug}`, async (route) => {
      if (route.request().method() !== "DELETE") return route.fallback();
      await route.fulfill({ status: 500, body: "boom" });
    });

    await form.openDeleteDialog();
    await form.deleteConfirmSubmitButton.click();

    await expect(form.deleteConfirmDialog).toContainText(
      "Couldn't delete this article. Please try again.",
    );
    // Retry-enabled: button is back to "Delete", not disabled, not still "Deleting…".
    const deleteButton = form.deleteConfirmDialog.getByRole("button", { name: "Delete" });
    await expect(deleteButton).toBeEnabled();
  });

  test("network abort — dialog surfaces retry copy; button re-enables", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const article = await articleFactory.create(loggedInPage.request, { published: false });
    const form = new ArticleFormPage(loggedInPage);
    await form.gotoEdit(article.slug);

    await loggedInPage.route(`**/api/articles/${article.slug}`, async (route) => {
      if (route.request().method() !== "DELETE") return route.fallback();
      await route.abort("failed");
    });

    await form.openDeleteDialog();
    await form.deleteConfirmSubmitButton.click();

    await expect(form.deleteConfirmDialog).toContainText(
      "Couldn't delete this article. Please try again.",
    );
    const deleteButton = form.deleteConfirmDialog.getByRole("button", { name: "Delete" });
    await expect(deleteButton).toBeEnabled();
  });

  test("focus contract — Cancel gets initial focus; trigger regains focus on close", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const article = await articleFactory.create(loggedInPage.request, { published: false });
    const form = new ArticleFormPage(loggedInPage);
    await form.gotoEdit(article.slug);

    // Initial focus on Cancel (spec § Accessibility) — a stray Enter
    // immediately after open must not fire the destructive action.
    await form.openDeleteDialog();
    await expect(form.deleteConfirmCancelButton).toBeFocused();

    // Cancel → focus returns to trigger.
    await form.deleteConfirmCancelButton.click();
    await expect(form.deleteButton).toBeFocused();

    // Escape → focus returns to trigger.
    await form.openDeleteDialog();
    await loggedInPage.keyboard.press("Escape");
    await expect(form.deleteButton).toBeFocused();
  });
});
