import { test, expect } from "@e2e/support/fixtures";
import { ArticleReadPage } from "@e2e/support/pom/article-read.page";

/** Acceptance criteria from docs/specs/articles-crud.md → Read. */

test.describe("@smoke read article", () => {
  test("published article renders title, subtitle, body, author, publishedAt", async ({
    page,
    loggedInPage,
    articleFactory,
  }) => {
    const article = await articleFactory.create(loggedInPage.request, { published: true });
    // Publicly visible — use the unauthenticated `page` to verify.
    const read = new ArticleReadPage(page);
    await read.gotoSlug(article.slug);

    await expect(read.titleHeading).toHaveText(article.title);
    await expect(read.subtitle).toContainText(article.subtitle!);
    await expect(read.body).toContainText("Body of art-");
    await expect(read.authorLine).toBeVisible();
  });

  test("draft article shows Draft badge and Edit link only to its author", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const article = await articleFactory.create(loggedInPage.request, { published: false });
    const read = new ArticleReadPage(loggedInPage);
    await read.gotoSlug(article.slug);

    await expect(read.draftBadge).toBeVisible();
    await expect(read.editLink).toBeVisible();
  });

  test("draft article 404s for a non-author (signed-out)", async ({
    page,
    loggedInPage,
    articleFactory,
  }) => {
    const article = await articleFactory.create(loggedInPage.request, { published: false });

    const response = await page.goto(`/articles/${article.slug}`);
    expect(response?.status()).toBe(404);
  });

  test("unknown slug returns 404", async ({ page }) => {
    const response = await page.goto("/articles/definitely-not-a-real-slug-8x7z");
    expect(response?.status()).toBe(404);
  });

  test("non-author viewing a published article does NOT see an Edit link", async ({
    page,
    loggedInPage,
    articleFactory,
  }) => {
    const article = await articleFactory.create(loggedInPage.request, { published: true });
    const read = new ArticleReadPage(page);
    await read.gotoSlug(article.slug);

    await expect(read.editLink).toHaveCount(0);
  });

  test("renders Tiptap formatting: heading, list, blockquote, code, link, bold", async ({
    page,
    loggedInPage,
  }) => {
    // Built inline (rather than through the factory) so this spec owns
    // the shape it asserts against — every downstream test doesn't need
    // to inherit a complex default doc.
    const doc = {
      type: "doc" as const,
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "The heading" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "A paragraph with " },
            {
              type: "text",
              text: "bold text",
              marks: [{ type: "bold" }],
            },
            { type: "text", text: " and a " },
            {
              type: "text",
              text: "link",
              marks: [{ type: "link", attrs: { href: "https://example.com/x" } }],
            },
            { type: "text", text: "." },
          ],
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                { type: "paragraph", content: [{ type: "text", text: "First bullet" }] },
              ],
            },
          ],
        },
        {
          type: "blockquote",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "A quote." }] },
          ],
        },
        {
          type: "codeBlock",
          content: [{ type: "text", text: "code goes here" }],
        },
      ],
    };
    const create = await loggedInPage.request.post("/api/articles", {
      data: {
        title: "Rich formatting fixture",
        subtitle: "with all the marks",
        body: doc,
        published: true,
      },
    });
    expect(create.status()).toBe(201);
    const { article } = (await create.json()) as { article: { slug: string } };

    // Public reader.
    const read = new ArticleReadPage(page);
    await read.gotoSlug(article.slug);

    await expect(
      read.body.getByRole("heading", { level: 2, name: "The heading" }),
    ).toBeVisible();
    await expect(read.body.getByRole("list")).toBeVisible();
    await expect(read.body.getByText("First bullet")).toBeVisible();
    await expect(read.body.getByRole("link", { name: "link" })).toHaveAttribute(
      "href",
      "https://example.com/x",
    );
    await expect(read.body.getByRole("link", { name: "link" })).toHaveAttribute(
      "rel",
      /noopener/,
    );
    // The next three assertions all reach for `locator(<css>)` because
    // each targets a rendered-HTML detail with no accessible-role
    // equivalent (bold is inline text; blockquote and code blocks have
    // no default ARIA role that Playwright's getByRole surfaces). CSS
    // is the only path from a Tiptap mark/node to a DOM assertion here.
    // TODO: fix locator — <strong> has no ARIA role covering "this text
    // is bold"; rendered-HTML-only assertion.
    await expect(read.body.locator("strong")).toHaveText("bold text");
    // TODO: fix locator — <blockquote> has no default ARIA role, so
    // getByRole can't reach it.
    await expect(read.body.locator("blockquote")).toContainText("A quote.");
    // TODO: fix locator — <pre><code> has no default ARIA role; the code
    // block is a rendered-HTML-only structure.
    await expect(read.body.locator("pre code")).toContainText("code goes here");
  });
});
