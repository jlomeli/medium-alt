import { test, expect } from "@e2e/support/fixtures";
import { ArticleFormPage } from "@e2e/support/pom/article-form.page";
import { ArticleReadPage } from "@e2e/support/pom/article-read.page";

/** Acceptance criteria from docs/specs/articles-editor.md → Editor UI. */

test.describe("@regression article editor", () => {
  test("renders a toolbar with the documented buttons", async ({ loggedInPage }) => {
    const form = new ArticleFormPage(loggedInPage);
    await form.gotoNew();

    // Every toolbar affordance is reachable by role + name. If any of
    // these throw a strict-mode violation it means we shipped two
    // buttons with the same label, which is its own bug.
    await expect(form.toolbar).toBeVisible();
    await expect(form.boldButton).toBeVisible();
    await expect(form.italicButton).toBeVisible();
    await expect(form.h2Button).toBeVisible();
    await expect(form.h3Button).toBeVisible();
    await expect(form.bulletListButton).toBeVisible();
    await expect(form.orderedListButton).toBeVisible();
    await expect(form.blockquoteButton).toBeVisible();
    await expect(form.codeBlockButton).toBeVisible();
    await expect(form.linkButton).toBeVisible();
    await expect(form.undoButton).toBeVisible();
    await expect(form.redoButton).toBeVisible();
  });

  test("clicking Bold on a selection renders <strong> in the read view + aria-pressed reports state", async ({
    loggedInPage,
    page,
  }) => {
    const form = new ArticleFormPage(loggedInPage);
    await form.gotoNew();
    await form.fill({ title: "Bold button roundtrip", published: true });
    await form.typeBody("Hello world");
    // Baseline: with caret outside a bold run, Bold is not pressed.
    await expect(form.boldButton).toHaveAttribute("aria-pressed", "false");

    await form.applyBoldToAll();
    // Caret is now inside a fully-bolded selection → Bold reports pressed.
    await expect(form.boldButton).toHaveAttribute("aria-pressed", "true");
    await form.submit();

    // The client `router.push` after a successful publish lands on
    // `/articles/<slug>-<8-hex>` — wait for that URL specifically. A
    // looser `/\/articles\/[a-z0-9-]+$/` also matches `/articles/new`
    // (which is where we started), so the assertion could pass before
    // the navigation happens and `loggedInPage.url()` would still be
    // `/articles/new` when the next line reads it.
    await loggedInPage.waitForURL(/\/articles\/[a-z][a-z0-9-]*-[a-f0-9]{8}$/);
    const read = new ArticleReadPage(page);
    await read.gotoSlug(
      new URL(loggedInPage.url()).pathname.replace(/^\/articles\//, ""),
    );
    await expect(read.body.locator("strong")).toHaveText("Hello world");
  });

  test("keyboard shortcut ⌘/Ctrl+B toggles bold — parity with the toolbar", async ({
    loggedInPage,
  }) => {
    const form = new ArticleFormPage(loggedInPage);
    await form.gotoNew();
    await form.typeBody("Shortcut test");
    await form.bodyEditor.press("ControlOrMeta+a");
    await form.bodyEditor.press("ControlOrMeta+b");
    await expect(form.boldButton).toHaveAttribute("aria-pressed", "true");

    // Second press toggles it off.
    await form.bodyEditor.press("ControlOrMeta+b");
    await expect(form.boldButton).toHaveAttribute("aria-pressed", "false");
  });

  test("Link prompt writes an <a> with rel=noopener noreferrer", async ({
    loggedInPage,
    page,
  }) => {
    const form = new ArticleFormPage(loggedInPage);
    await form.gotoNew();
    await form.fill({ title: "Link prompt", published: true });
    await form.typeBody("go somewhere");
    await form.applyLinkToAll("https://example.com/here");
    await form.submit();

    // See the Bold test above for why we wait for the slug URL rather
    // than trusting `loggedInPage.url()` immediately after `submit()`.
    await loggedInPage.waitForURL(/\/articles\/[a-z][a-z0-9-]*-[a-f0-9]{8}$/);
    const read = new ArticleReadPage(page);
    await read.gotoSlug(
      new URL(loggedInPage.url()).pathname.replace(/^\/articles\//, ""),
    );
    const anchor = read.body.getByRole("link", { name: "go somewhere" });
    await expect(anchor).toHaveAttribute("href", "https://example.com/here");
    await expect(anchor).toHaveAttribute("rel", /noopener/);
    await expect(anchor).toHaveAttribute("rel", /noreferrer/);
  });

  test("undo rewinds the last insertion; redo replays it", async ({ loggedInPage }) => {
    const form = new ArticleFormPage(loggedInPage);
    await form.gotoNew();
    await form.typeBody("first");
    await form.bodyEditor.press("Enter");
    await form.bodyEditor.press("Enter");
    await form.bodyEditor.pressSequentially("second");
    await expect(form.bodyEditor).toContainText("second");

    await form.undoButton.click();
    // After one undo, the "second" paragraph is gone.
    await expect(form.bodyEditor).not.toContainText("second");

    await form.redoButton.click();
    await expect(form.bodyEditor).toContainText("second");
  });
});
