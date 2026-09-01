import type { Page } from "@playwright/test";
import { BasePage } from "./base.page";

/**
 * Page Object for the article form — used by both `/articles/new` and
 * `/articles/[slug]/edit`. The two URLs share the same field layout, so
 * one POM handles both; `.gotoNew()` and `.gotoEdit(slug)` pick the
 * navigation target.
 *
 * ## 4b: editor surface
 *
 * `bodyEditor` reaches the Tiptap ProseMirror surface via `getByRole
 * ('textbox', { name: 'Body' })`. The editor component must render its
 * `EditorContent` with `aria-label="Body"` (and, if ProseMirror doesn't
 * set it natively, `role="textbox"`) so the role locator resolves —
 * this is the same accessibility bar every other form field on the app
 * hits; no `data-testid` escape hatch.
 *
 * Toolbar buttons are all `getByRole('button', { name })` — no icon-only
 * buttons, no `aria-label` sprinkling; the toolbar container gets
 * `role="toolbar"` so `getByRole('toolbar')` scopes searches when we
 * need to disambiguate.
 */
export class ArticleFormPage extends BasePage {
  readonly url = "/articles/new";

  readonly newHeading;
  readonly editHeading;
  readonly titleField;
  readonly subtitleField;
  readonly bodyEditor;
  readonly publishedCheckbox;
  readonly saveButton;
  readonly deleteButton;
  // Slice 5 — tags input on the article form.
  readonly tagsField;

  readonly toolbar;
  readonly boldButton;
  readonly italicButton;
  readonly h2Button;
  readonly h3Button;
  readonly bulletListButton;
  readonly orderedListButton;
  readonly blockquoteButton;
  readonly codeBlockButton;
  readonly linkButton;
  readonly undoButton;
  readonly redoButton;

  // Slice 4c — cover image + inline image.
  readonly coverImageButton;
  readonly changeCoverButton;
  readonly removeCoverButton;
  readonly coverImagePreview;
  readonly coverAltField;

  readonly addImageButton;
  readonly altTextDialog;
  readonly altTextField;
  readonly altTextConfirm;
  readonly altTextCancel;

  constructor(page: Page) {
    super(page);
    this.newHeading = this.page.getByRole("heading", { name: "New article" });
    this.editHeading = this.page.getByRole("heading", { name: "Edit article" });
    // Exact match — "Subtitle" would otherwise also match a non-exact
    // `getByLabel("Title")` and produce a strict-mode violation.
    this.titleField = this.page.getByLabel("Title", { exact: true });
    this.subtitleField = this.page.getByLabel(/^subtitle/i);
    this.bodyEditor = this.page.getByRole("textbox", { name: "Body" });
    this.publishedCheckbox = this.page.getByRole("checkbox", {
      name: "Publish this article",
    });
    this.tagsField = this.page.getByLabel("Tags", { exact: true });
    this.saveButton = this.page.getByRole("button", { name: /^(save|publish)/i });
    // Delete only appears on the edit page.
    this.deleteButton = this.page.getByRole("button", { name: "Delete article" });

    // Toolbar — scoped so a same-named button elsewhere on the page
    // (unlikely, but future-proof) can't collide.
    this.toolbar = this.page.getByRole("toolbar");
    this.boldButton = this.toolbar.getByRole("button", { name: "Bold" });
    this.italicButton = this.toolbar.getByRole("button", { name: "Italic" });
    this.h2Button = this.toolbar.getByRole("button", { name: "Heading 2" });
    this.h3Button = this.toolbar.getByRole("button", { name: "Heading 3" });
    this.bulletListButton = this.toolbar.getByRole("button", { name: "Bullet list" });
    this.orderedListButton = this.toolbar.getByRole("button", { name: "Numbered list" });
    this.blockquoteButton = this.toolbar.getByRole("button", { name: "Blockquote" });
    this.codeBlockButton = this.toolbar.getByRole("button", { name: "Code block" });
    this.linkButton = this.toolbar.getByRole("button", { name: "Link" });
    this.undoButton = this.toolbar.getByRole("button", { name: "Undo" });
    this.redoButton = this.toolbar.getByRole("button", { name: "Redo" });

    // Cover-image affordances (see docs/specs/articles-images.md
    // § Acceptance criteria — Cover image). The empty-state button
    // reads "Upload cover image"; once a cover is set it becomes
    // "Change cover image", and a "Remove cover image" button
    // appears alongside. The rendered preview is discoverable via
    // `getByRole('img', { name: /* alt */ })` — under `<img alt="">`
    // (decorative), no accessible name is exposed, so this locator
    // uses `role: 'img'` scoped to the form + a distinguishing
    // class-agnostic ancestor via the alt-field's presence.
    this.coverImageButton = this.page.getByRole("button", {
      name: "Upload cover image",
    });
    this.changeCoverButton = this.page.getByRole("button", {
      name: "Change cover image",
    });
    this.removeCoverButton = this.page.getByRole("button", {
      name: "Remove cover image",
    });
    // The preview `<img>` sits directly under the "Cover image" label
    // paragraph. Scope by role — the article-body region (also a
    // section labelled "Body") lives BELOW the form and shouldn't
    // pick up here since this POM is only used on the edit/new
    // pages.
    this.coverImagePreview = this.page.getByRole("img");
    this.coverAltField = this.page.getByLabel(/cover alt text/i);

    this.addImageButton = this.toolbar.getByRole("button", { name: "Add image" });
    this.altTextDialog = this.page.getByRole("dialog", { name: /alt text/i });
    this.altTextField = this.altTextDialog.getByLabel("Alt text");
    this.altTextConfirm = this.altTextDialog.getByRole("button", {
      name: /insert/i,
    });
    this.altTextCancel = this.altTextDialog.getByRole("button", { name: /cancel/i });
  }

  async gotoNew(): Promise<void> {
    await this.page.goto("/articles/new");
  }

  async gotoEdit(slug: string): Promise<void> {
    await this.page.goto(`/articles/${slug}/edit`);
  }

  async fill(input: {
    title?: string;
    subtitle?: string;
    body?: string;
    published?: boolean;
    /** Comma-separated tag input; server normalises on save. */
    tags?: string;
  }): Promise<void> {
    if (input.title !== undefined) await this.titleField.fill(input.title);
    if (input.subtitle !== undefined) await this.subtitleField.fill(input.subtitle);
    if (input.body !== undefined) {
      // Tiptap's ProseMirror surface is contenteditable — `.fill()` on
      // a plain string would not work. Clear via Meta+A/Delete, then
      // type. `pressSequentially` respects the editor's input handling
      // (including transforming `\n\n` into paragraph splits when the
      // Enter key fires, which we approximate here).
      await this.bodyEditor.click();
      await this.bodyEditor.press("ControlOrMeta+a");
      await this.bodyEditor.press("Delete");
      await this.typeBody(input.body);
    }
    if (input.published !== undefined) {
      if (input.published) await this.publishedCheckbox.check();
      else await this.publishedCheckbox.uncheck();
    }
    if (input.tags !== undefined) await this.tagsField.fill(input.tags);
  }

  /**
   * Type into the body editor. Converts blank-line-separated paragraphs
   * into real paragraph splits by pressing Enter twice — matches what
   * a human would do and lets the Tiptap doc structure mirror the
   * plain-text-with-newlines convention the factory uses.
   *
   * For each paragraph, uses `keyboard.insertText` (a single `input`
   * event carrying the whole string) rather than `pressSequentially`
   * (one keystroke per char). Char-by-char is unacceptably slow at
   * the max-body-size cap (40k chars ≈ 400s at 10ms/keystroke) and
   * offers no extra coverage — ProseMirror's paste/composition paths
   * both funnel through the same input event listener.
   */
  async typeBody(text: string): Promise<void> {
    await this.bodyEditor.click();
    const paragraphs = text.split(/\n{2,}/);
    for (let i = 0; i < paragraphs.length; i++) {
      if (i > 0) {
        await this.bodyEditor.press("Enter");
        await this.bodyEditor.press("Enter");
      }
      await this.page.keyboard.insertText(paragraphs[i]!);
    }
  }

  /**
   * Select all body content then click the Bold toolbar button.
   * Convenience wrapper — tests that only care about the "did clicking
   * Bold apply Bold" question shouldn't re-implement the selection
   * choreography.
   */
  async applyBoldToAll(): Promise<void> {
    await this.bodyEditor.click();
    await this.bodyEditor.press("ControlOrMeta+a");
    await this.boldButton.click();
  }

  /**
   * Select all body content then insert a link. The editor renders a
   * URL prompt as a `role="dialog"` with a `getByLabel("URL")` field
   * (documented in the 4b spec); this helper fills + submits it.
   */
  async applyLinkToAll(url: string): Promise<void> {
    await this.bodyEditor.click();
    await this.bodyEditor.press("ControlOrMeta+a");
    await this.linkButton.click();
    const dialog = this.page.getByRole("dialog", { name: /link/i });
    await dialog.getByLabel("URL").fill(url);
    await dialog.getByRole("button", { name: /add|apply|ok/i }).click();
  }

  /**
   * Click "Delete article" and wait for the DELETE response before
   * returning — same rationale as `submit()`: callers can immediately
   * follow up with a verification GET without racing an in-flight write.
   * The caller is responsible for wiring `page.once("dialog", ...)` to
   * accept the `window.confirm()` before invoking.
   */
  async delete(): Promise<void> {
    await Promise.all([
      this.page.waitForResponse(
        (res) =>
          /\/api\/articles\/[^/?]+$/.test(new URL(res.url()).pathname) &&
          res.request().method() === "DELETE",
      ),
      this.deleteButton.click(),
    ]);
  }

  /**
   * Upload a cover image via the visible "Upload / Change cover image"
   * button. The button proxies a click to a hidden `<input type="file">`
   * — Playwright's `waitForEvent("filechooser")` intercepts the
   * resulting native prompt, so we set files on the chooser rather than
   * reaching into the DOM for the input (which the locator policy
   * forbids: positional CSS breaks the moment DOM order shifts).
   *
   * Waits for the POST /api/uploadthing round-trip before returning so
   * downstream state assertions don't race the upload. For tests that
   * expect the client-side pre-flight (MIME / size) to short-circuit
   * BEFORE any network call fires, use `pickCoverFile()` instead.
   */
  async uploadCover(input: {
    buffer: Buffer;
    filename: string;
    mime: string;
  }): Promise<void> {
    const chooser = await this.openCoverFilePicker();
    await Promise.all([
      this.page.waitForResponse(
        (res) =>
          res.url().endsWith("/api/uploadthing") &&
          res.request().method() === "POST",
      ),
      chooser.setFiles({
        name: input.filename,
        mimeType: input.mime,
        buffer: input.buffer,
      }),
    ]);
  }

  /**
   * Same button-driven file-chooser flow as `uploadCover`, but does
   * NOT wait for a network response. Use in the upload-errors specs
   * where the client-side pre-flight is expected to reject the file
   * before firing POST /api/uploadthing.
   */
  async pickCoverFile(input: {
    buffer: Buffer;
    filename: string;
    mime: string;
  }): Promise<void> {
    const chooser = await this.openCoverFilePicker();
    await chooser.setFiles({
      name: input.filename,
      mimeType: input.mime,
      buffer: input.buffer,
    });
  }

  /**
   * Click "Add image", hand a file to the resulting file chooser, wait
   * for the upload response, and leave the alt-text dialog open. The
   * caller finishes the flow (fill + confirm, or cancel). Extracted so
   * the "confirm disabled while alt empty" and "cancel → no image
   * node" tests don't have to duplicate the click + chooser + wait
   * choreography.
   */
  async openInlineImageAltDialog(input: {
    buffer: Buffer;
    filename: string;
    mime: string;
  }): Promise<void> {
    const chooser = await this.openInlineImageFilePicker();
    await Promise.all([
      this.page.waitForResponse(
        (res) =>
          res.url().endsWith("/api/uploadthing") &&
          res.request().method() === "POST",
      ),
      chooser.setFiles({
        name: input.filename,
        mimeType: input.mime,
        buffer: input.buffer,
      }),
    ]);
    await this.altTextDialog.waitFor({ state: "visible" });
  }

  /**
   * End-to-end helper for the inline image flow: open the alt-text
   * dialog via `openInlineImageAltDialog`, fill alt, confirm.
   */
  async uploadInlineImage(
    input: { buffer: Buffer; filename: string; mime: string },
    opts: { alt: string },
  ): Promise<void> {
    await this.openInlineImageAltDialog(input);
    await this.altTextField.fill(opts.alt);
    await this.altTextConfirm.click();
  }

  /**
   * Click the visible cover-image trigger (empty-state "Upload cover
   * image" OR "Change cover image" once a cover is set) and return the
   * intercepted file chooser. The two possible button labels are
   * OR'd via `.or()` so the caller doesn't have to branch on the
   * current cover state.
   */
  private async openCoverFilePicker() {
    const trigger = this.coverImageButton.or(this.changeCoverButton);
    const [chooser] = await Promise.all([
      this.page.waitForEvent("filechooser"),
      trigger.click(),
    ]);
    return chooser;
  }

  /**
   * Click "Add image" in the editor toolbar and return the intercepted
   * file chooser.
   */
  private async openInlineImageFilePicker() {
    const [chooser] = await Promise.all([
      this.page.waitForEvent("filechooser"),
      this.addImageButton.click(),
    ]);
    return chooser;
  }

  async submit(): Promise<void> {
    // Race the two possible outcomes:
    //   - happy path: the underlying POST/PATCH completes;
    //   - client-side reject: the schema fires before any request goes out,
    //     and an inline `role="alert"` renders.
    // Waiting for either lets happy-path callers avoid a browser navigation
    // cancelling the in-flight fetch AND avoids hanging on the client-only
    // failure paths where no network call is ever made.
    const alertCountBefore = await this.page.getByRole("alert").count();
    const network = this.page.waitForResponse(
      (res) =>
        /\/api\/articles(\/[^/?]+)?$/.test(new URL(res.url()).pathname) &&
        ["POST", "PATCH"].includes(res.request().method()),
    );
    const newAlert = this.page
      .locator(`role=alert >> nth=${alertCountBefore}`)
      .waitFor({ state: "visible" });
    await this.saveButton.click();
    await Promise.race([network, newAlert]);
  }
}
