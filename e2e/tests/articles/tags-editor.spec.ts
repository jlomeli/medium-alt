import { randomBytes } from "node:crypto";
import { test, expect } from "@e2e/support/fixtures";
import { ArticleFormPage } from "@e2e/support/pom/article-form.page";

/**
 * Editor-side tag flow. See docs/specs/tags-feed.md § Author-side tag
 * input.
 */

function unique(prefix: string): string {
  return `${prefix}-${randomBytes(4).toString("hex")}`;
}

test.describe("@regression article tags — editor", () => {
  test("creating with tags stores them; edit form prefills current tags", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const form = new ArticleFormPage(loggedInPage);
    const attrs = articleFactory.build({ published: true });
    const [a, b] = [unique("editor"), unique("editor")];

    await form.gotoNew();
    await form.fill({ ...attrs, tags: `${a}, ${b}` });
    await form.submit();

    // Land on the published read view.
    await expect(loggedInPage).toHaveURL(/\/articles\/[a-z0-9-]+$/);
    // Tag chips are rendered under the author line.
    const chipA = loggedInPage.getByRole("link", { name: `#${a}` });
    const chipB = loggedInPage.getByRole("link", { name: `#${b}` });
    await expect(chipA).toBeVisible();
    await expect(chipB).toBeVisible();

    // Navigate to the edit page — the tags input should be prefilled
    // with the (sorted) current slugs.
    const url = new URL(loggedInPage.url());
    await loggedInPage.goto(`${url.pathname}/edit`);
    const prefill = [a, b].sort().join(", ");
    await expect(form.tagsField).toHaveValue(prefill);
  });

  test("clearing the tags field on edit removes all tags", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const form = new ArticleFormPage(loggedInPage);
    const tag = unique("goodbye");
    const article = await articleFactory.create(loggedInPage.request, {
      published: true,
      tags: [tag],
    });

    await form.gotoEdit(article.slug);
    await form.tagsField.fill("");
    await form.submit();

    // Back on the read view; the tag chip should be gone.
    await expect(loggedInPage).toHaveURL(`/articles/${article.slug}`);
    await expect(
      loggedInPage.getByRole("link", { name: `#${tag}` }),
    ).toHaveCount(0);
  });

  test("normalisation preview appears under the tags input", async ({
    loggedInPage,
  }) => {
    const form = new ArticleFormPage(loggedInPage);
    await form.gotoNew();
    await form.tagsField.fill("Software Testing, QA");
    // The hint text renders the normalised slugs. Assert against the
    // slug shape rather than an exact hint string so a copywriting
    // change to the hint doesn't cascade into a test failure.
    await expect(loggedInPage.getByText(/#software-testing/)).toBeVisible();
    await expect(loggedInPage.getByText(/#qa/)).toBeVisible();
  });
});
