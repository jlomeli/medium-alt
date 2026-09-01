import { test, expect } from "@e2e/support/fixtures";
import { ArticleFormPage } from "@e2e/support/pom/article-form.page";

/**
 * Acceptance criteria from docs/specs/articles-images.md § Cover image.
 * Every affordance is `getByRole('button', { name: /cover image/i })`
 * reachable — no `data-testid` on the form.
 *
 * Tagged `@needs-test-seam` because uploads route through the E2E stub
 * storage adapter (gated on `process.env.E2E === "1"`), which writes to
 * `test-results/uploads/` on the app's file system. Vercel serverless
 * has no persistent FS and doesn't ship with `E2E=1`, so on the PR
 * preview `/api/uploadthing` either 500s (missing UploadThing token) or
 * succeeds against real UploadThing (would leave orphan files in prod
 * storage). Skipped on the preview e2e workflow; ci.yml + local dev
 * still run it.
 */
test.describe("@smoke @regression @needs-test-seam articles cover image", () => {
  test("upload cover, publish, hero renders above title on read view", async ({
    loggedInPage,
    articleFactory,
    imageFactory,
  }) => {
    const form = new ArticleFormPage(loggedInPage);
    const attrs = articleFactory.build({ published: true });
    await form.gotoNew();
    await form.fill(attrs);

    await expect(form.coverImageButton).toBeVisible();
    await form.uploadCover(imageFactory.tinyPng());

    // Preview + Change/Remove appear once the upload lands.
    await expect(form.changeCoverButton).toBeVisible();
    await expect(form.removeCoverButton).toBeVisible();
    await form.coverAltField.fill("a small square");

    await form.submit();

    // On the read view, the hero is a plain <img>. `getByRole('img',
    // { name })` matches the accessible-name path.
    await expect(loggedInPage).toHaveURL(/\/articles\/[a-z0-9-]+$/);
    await expect(
      loggedInPage.getByRole("img", { name: "a small square" }),
    ).toBeVisible();
  });
});

test.describe("@regression @needs-test-seam articles cover image", () => {
  test("change cover replaces the preview URL", async ({
    loggedInPage,
    articleFactory,
    imageFactory,
  }) => {
    // Alt text is filled BEFORE the preview src is probed so the
    // rendered `<img>` has a non-empty `alt` and therefore a real
    // `role="img"` in the a11y tree — with `alt=""` the browser
    // treats it as decorative and hides it from getByRole.
    const form = new ArticleFormPage(loggedInPage);
    await form.gotoNew();
    await form.fill(articleFactory.build({ published: false }));
    await form.uploadCover(imageFactory.tinyPng());
    await form.coverAltField.fill("first cover");
    const firstPreviewSrc = await loggedInPage
      .getByRole("img", { name: "first cover" })
      .getAttribute("src");
    expect(firstPreviewSrc).toBeTruthy();

    await form.uploadCover(imageFactory.tinyJpeg());
    await form.coverAltField.fill("second cover");
    const secondPreviewSrc = await loggedInPage
      .getByRole("img", { name: "second cover" })
      .getAttribute("src");
    expect(secondPreviewSrc).toBeTruthy();
    expect(secondPreviewSrc).not.toBe(firstPreviewSrc);
  });

  test("remove cover then save — hero disappears on re-read", async ({
    loggedInPage,
    articleFactory,
    imageFactory,
  }) => {
    const form = new ArticleFormPage(loggedInPage);
    const attrs = articleFactory.build({ published: true });
    await form.gotoNew();
    await form.fill(attrs);
    await form.uploadCover(imageFactory.tinyPng());
    await form.coverAltField.fill("temporary hero");
    await form.submit();

    // Confirm the hero is there first.
    await expect(loggedInPage.getByRole("img", { name: "temporary hero" })).toBeVisible();

    // Back to edit — remove cover, save, re-read.
    await loggedInPage.getByRole("link", { name: "Edit" }).click();
    await expect(form.editHeading).toBeVisible();
    await form.removeCoverButton.click();
    await expect(form.coverImageButton).toBeVisible();
    await form.submit();

    // Draft-vs-published is preserved; navigate to the read view.
    if (!/\/edit$/.test(loggedInPage.url())) {
      // If the save routed us elsewhere (publish path), we're already on read.
    } else {
      const slug = loggedInPage.url().match(/\/articles\/([^/]+)\/edit/)![1]!;
      await loggedInPage.goto(`/articles/${slug}`);
    }
    await expect(
      loggedInPage.getByRole("img", { name: "temporary hero" }),
    ).toHaveCount(0);
  });
});
