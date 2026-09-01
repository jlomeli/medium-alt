import { test, expect } from "@e2e/support/fixtures";
import { ArticleFormPage } from "@e2e/support/pom/article-form.page";

/**
 * Acceptance criteria from docs/specs/articles-images.md § Inline
 * images. The toolbar "Add image" button triggers an upload; on
 * success, an alt-text dialog gates insertion; confirm inserts the
 * image node at the caret. The read view renders `<img alt>` inside
 * the body region.
 */
test.describe("@smoke @regression articles inline image", () => {
  test("upload image, enter alt, image renders in read view", async ({
    loggedInPage,
    articleFactory,
    imageFactory,
  }) => {
    const form = new ArticleFormPage(loggedInPage);
    const attrs = articleFactory.build({ published: true });
    await form.gotoNew();
    await form.fill(attrs);

    // Insert an image via the toolbar. The helper waits for the
    // upload response, then fills + confirms the alt-text dialog.
    await form.uploadInlineImage(imageFactory.tinyPng(), { alt: "inline picture" });
    await expect(form.altTextDialog).toHaveCount(0);

    await form.submit();

    await expect(loggedInPage).toHaveURL(/\/articles\/[a-z0-9-]+$/);
    await expect(
      loggedInPage.getByRole("img", { name: "inline picture" }),
    ).toBeVisible();
  });
});

test.describe("@regression articles inline image", () => {
  test("confirm is disabled while alt text is empty", async ({
    loggedInPage,
    articleFactory,
    imageFactory,
  }) => {
    const form = new ArticleFormPage(loggedInPage);
    await form.gotoNew();
    await form.fill(articleFactory.build({ published: false }));

    await form.openInlineImageAltDialog({
      buffer: imageFactory.tinyPng().buffer,
      filename: "tiny.png",
      mime: "image/png",
    });

    await expect(form.altTextDialog).toBeVisible();
    await expect(form.altTextConfirm).toBeDisabled();

    await form.altTextField.fill("now valid");
    await expect(form.altTextConfirm).toBeEnabled();
  });

  test("cancelling the alt-text dialog leaves no image in the doc", async ({
    loggedInPage,
    articleFactory,
    imageFactory,
  }) => {
    const form = new ArticleFormPage(loggedInPage);
    await form.gotoNew();
    await form.fill(articleFactory.build({ published: false }));

    await form.openInlineImageAltDialog({
      buffer: imageFactory.tinyPng().buffer,
      filename: "tiny.png",
      mime: "image/png",
    });

    await expect(form.altTextDialog).toBeVisible();
    await form.altTextCancel.click();
    await expect(form.altTextDialog).toHaveCount(0);

    // No image node was inserted → the editor's contenteditable
    // contains no `<img>`.
    await expect(form.bodyEditor.locator("img")).toHaveCount(0);
  });
});
