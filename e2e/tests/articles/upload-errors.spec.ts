import { test, expect } from "@e2e/support/fixtures";
import { ArticleFormPage } from "@e2e/support/pom/article-form.page";

/**
 * Acceptance criteria from docs/specs/articles-images.md § Upload
 * endpoint (client-visible errors). Over-cap and wrong-MIME both
 * surface via `role="alert"`. The over-cap test also verifies the
 * client-side pre-flight prevents the network request from firing —
 * saves a round-trip and (in prod) a wasted UploadThing call.
 */
test.describe("@regression articles upload errors", () => {
  test("oversized cover upload surfaces a role='alert' + no network POST", async ({
    loggedInPage,
    articleFactory,
    imageFactory,
  }) => {
    const form = new ArticleFormPage(loggedInPage);
    await form.gotoNew();
    await form.fill(articleFactory.build({ published: false }));

    // Watch for /api/uploadthing traffic during the interaction —
    // the pre-flight check MUST short-circuit and prevent any POST.
    let uploadCalled = false;
    loggedInPage.on("request", (req) => {
      if (req.url().endsWith("/api/uploadthing") && req.method() === "POST") {
        uploadCalled = true;
      }
    });

    const big = imageFactory.oversizedBuffer();
    const fileInput = loggedInPage.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: big.filename,
      mimeType: big.mime,
      buffer: big.buffer,
    });

    await expect(
      loggedInPage.getByRole("alert").filter({ hasText: /too large|max/i }),
    ).toBeVisible();
    expect(uploadCalled).toBe(false);
  });

  test("wrong-MIME cover upload surfaces a role='alert'", async ({
    loggedInPage,
    articleFactory,
    imageFactory,
  }) => {
    const form = new ArticleFormPage(loggedInPage);
    await form.gotoNew();
    await form.fill(articleFactory.build({ published: false }));

    const txt = imageFactory.textBuffer();
    const fileInput = loggedInPage.locator('input[type="file"]').first();
    await fileInput.setInputFiles({
      name: txt.filename,
      mimeType: txt.mime,
      buffer: txt.buffer,
    });

    await expect(
      loggedInPage
        .getByRole("alert")
        .filter({ hasText: /image types|allowed|unsupported/i }),
    ).toBeVisible();
  });
});
