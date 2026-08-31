import { test, expect } from "@e2e/support/fixtures";
import { ArticleFormPage } from "@e2e/support/pom/article-form.page";
import { ArticleReadPage } from "@e2e/support/pom/article-read.page";

/**
 * Anti-XSS guarantees for the read view. See
 * docs/specs/articles-editor.md § Rendering — the safety story is
 * validation-by-construction (Zod allowlist on node/mark types + link
 * schemes), not post-render DOMPurify.
 */

test.describe("@regression article renderer XSS defenses", () => {
  test("literal <script> typed into the editor renders as visible text, not an executing node", async ({
    loggedInPage,
    page,
  }) => {
    const form = new ArticleFormPage(loggedInPage);
    await form.gotoNew();
    await form.fill({ title: "hostile-text", published: true });
    const hostile = "<script>window.__pwned__ = true</script>";
    await form.typeBody(hostile);
    await form.submit();

    // `submit()` resolves on the POST response; the client
    // `router.push('/articles/<slug>')` runs afterwards. Wait for the
    // slug URL to settle before reading `loggedInPage.url()` — the
    // regex is tight enough to exclude the starting `/articles/new`.
    await loggedInPage.waitForURL(/\/articles\/[a-z][a-z0-9-]*-[a-f0-9]{8}$/);
    const read = new ArticleReadPage(page);
    await read.gotoSlug(
      new URL(loggedInPage.url()).pathname.replace(/^\/articles\//, ""),
    );

    // The text is present as text content — Tiptap treats it as literal
    // characters. The body must NOT contain a real <script> element.
    await expect(read.body).toContainText(hostile);
    await expect(read.body.locator("script")).toHaveCount(0);

    // Belt-and-braces: the malicious side effect never landed.
    const pwned = await page.evaluate(
      () => (window as unknown as { __pwned__?: boolean }).__pwned__,
    );
    expect(pwned).toBeUndefined();
  });

  test("javascript: URL on a link mark is rejected server-side (never renders as href)", async ({
    loggedInPage,
  }) => {
    // The client editor guards this in the link prompt, but the server
    // is the authoritative fence — hit the API directly to prove it.
    const res = await loggedInPage.request.post("/api/articles", {
      data: {
        title: "hostile-link",
        subtitle: "n/a",
        body: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "click me",
                  marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
                },
              ],
            },
          ],
        },
        published: true,
      },
    });
    expect(res.status()).toBe(400);
  });

  test("data: URL on a link mark is rejected server-side", async ({ loggedInPage }) => {
    const res = await loggedInPage.request.post("/api/articles", {
      data: {
        title: "hostile-link-data",
        subtitle: "n/a",
        body: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "click me",
                  marks: [
                    {
                      type: "link",
                      attrs: { href: "data:text/html,<script>alert(1)</script>" },
                    },
                  ],
                },
              ],
            },
          ],
        },
        published: true,
      },
    });
    expect(res.status()).toBe(400);
  });
});
