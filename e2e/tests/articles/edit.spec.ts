import { test, expect } from "@e2e/support/fixtures";
import { ArticleFormPage } from "@e2e/support/pom/article-form.page";
import { ArticleReadPage } from "@e2e/support/pom/article-read.page";

/** Acceptance criteria from docs/specs/articles-crud.md → Edit. */

test.describe("@regression edit article", () => {
  test("prefills with current title, subtitle, body, published state", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const article = await articleFactory.create(loggedInPage.request, { published: false });
    const form = new ArticleFormPage(loggedInPage);
    await form.gotoEdit(article.slug);

    await expect(form.editHeading).toBeVisible();
    await expect(form.titleField).toHaveValue(article.title);
    await expect(form.subtitleField).toHaveValue(article.subtitle!);
    await expect(form.bodyField).toHaveValue(article.body);
    await expect(form.publishedCheckbox).not.toBeChecked();
  });

  test("changing the title does NOT change the slug", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const article = await articleFactory.create(loggedInPage.request, { published: true });
    const form = new ArticleFormPage(loggedInPage);
    await form.gotoEdit(article.slug);

    await form.fill({ title: "A totally different title" });
    await form.submit();

    // Redirect target for a published article is /articles/{slug} —
    // the SAME slug the article had before the title change.
    await expect(loggedInPage).toHaveURL(new RegExp(`/articles/${article.slug}$`));
  });

  test("toggling published on sets publishedAt on the read view", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const article = await articleFactory.create(loggedInPage.request, { published: false });
    const form = new ArticleFormPage(loggedInPage);
    const read = new ArticleReadPage(loggedInPage);

    await form.gotoEdit(article.slug);
    await form.fill({ published: true });
    await form.submit();

    // After save, published article lands on the public read view.
    await read.gotoSlug(article.slug);
    await expect(read.draftBadge).toHaveCount(0);
    // The author line contains a publishedAt phrase — matches on year at
    // minimum so the test isn't tied to a specific date format.
    await expect(read.authorLine).toContainText(/20\d\d/);
  });

  test("toggling published off clears the publishedAt on the article", async ({
    loggedInPage,
    articleFactory,
  }) => {
    const article = await articleFactory.create(loggedInPage.request, { published: true });
    const form = new ArticleFormPage(loggedInPage);

    await form.gotoEdit(article.slug);
    await form.fill({ published: false });
    await form.submit();

    // Verified via API — the UI's "Draft" badge is covered in the read
    // spec; here we assert the actual field cleared.
    const res = await loggedInPage.request.get(`/api/articles/${article.slug}`);
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { article: { published: boolean; publishedAt: unknown } };
    expect(body.article.published).toBe(false);
    expect(body.article.publishedAt).toBeNull();
  });

  test("non-author visiting /articles/[slug]/edit returns 404 (not 403)", async ({
    loggedInPage,
    articleFactory,
    userFactory,
  }) => {
    // Article owned by loggedInPage's user.
    const article = await articleFactory.create(loggedInPage.request, { published: true });

    // Sign a SECOND user in on a fresh browser context.
    // The simplest way for this test: use the unauthenticated `page`
    // fixture and API-login as the stranger via the same context.
    const stranger = await userFactory.create();
    const csrfRes = await loggedInPage.context().request.get("/api/auth/csrf");
    void (await csrfRes.json());
    // Simpler: hit /api/login as stranger from a fresh browser context via
    // the userFactory flow — but that requires new context setup. Cheaper:
    // exercise this constraint at the API layer where authz is decided.
    const meBefore = await loggedInPage.request.get("/api/me");
    expect(meBefore.status()).toBe(200);

    // Log out the owner + log in the stranger in the same browser context.
    await loggedInPage.request.post("/api/logout");
    const login = await loggedInPage.request.post("/api/login", {
      data: { email: stranger.email, password: stranger.password },
    });
    expect(login.status()).toBe(200);

    const response = await loggedInPage.goto(`/articles/${article.slug}/edit`);
    expect(response?.status()).toBe(404);
  });

  test("signed-out visitor to /articles/[slug]/edit is redirected to /login", async ({
    page,
    userFactory,
    articleFactory,
  }) => {
    // We need an article to hit; create one via a throwaway logged-in
    // context, then use `page` (unauthenticated) to visit.
    const owner = await userFactory.create();
    const login = await page.request.post("/api/login", {
      data: { email: owner.email, password: owner.password },
    });
    expect(login.status()).toBe(200);
    const article = await articleFactory.create(page.request, { published: false });
    await page.request.post("/api/logout");

    await page.goto(`/articles/${article.slug}/edit`);
    await expect(page).toHaveURL(new RegExp(`/login\\?callbackUrl=%2Farticles%2F${article.slug}%2Fedit`));
  });
});
