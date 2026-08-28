import { test, expect } from "@e2e/support/fixtures";
import { ApiDocsPage } from "@e2e/support/pom/api-docs.page";

/**
 * Acceptance criteria from docs/specs/api-docs.md → docs page.
 *
 * RED — /api/docs doesn't exist yet.
 */

test.describe("@smoke api docs", () => {
  test("renders the Scalar-driven API reference with an h1 title", async ({ page, api }) => {
    // Cross-check the h1 against the OpenAPI document — the docs page and
    // spec are generated from the same source, and if they drift we want the
    // test to fail with an actionable message.
    const specRes = await api.get("/api/openapi.json");
    const spec = (await specRes.json()) as { info: { title: string } };

    const docs = new ApiDocsPage(page);
    await docs.goto();

    await expect(docs.heading).toBeVisible();
    await expect(docs.heading).toHaveText(spec.info.title);
  });
});
