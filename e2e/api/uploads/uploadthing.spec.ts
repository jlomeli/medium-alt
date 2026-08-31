import { test, expect } from "@e2e/support/fixtures";

/**
 * HTTP contract for `/api/uploadthing` — docs/specs/articles-images.md
 * § Upload endpoint. Covers the auth gate, size cap, MIME allowlist,
 * and the response envelope the client-side `uploadImage()` helper
 * depends on.
 */
test.describe("@smoke @api uploadthing route", () => {
  test("POST /api/uploadthing — 401 unauthenticated", async ({ api, imageFactory }) => {
    const png = imageFactory.tinyPng();
    const res = await api.post("/api/uploadthing", {
      multipart: {
        file: { name: png.filename, mimeType: png.mime, buffer: png.buffer },
      },
    });
    expect(res.status()).toBe(401);
    expect((await res.json()) as { error: string }).toMatchObject({
      error: "unauthenticated",
    });
  });
});

test.describe("@regression @api uploadthing route", () => {
  test("POST /api/uploadthing — 200 + { files: [{ url, key }] } on valid upload", async ({
    loggedInPage,
    imageFactory,
  }) => {
    const png = imageFactory.tinyPng();
    const res = await loggedInPage.request.post("/api/uploadthing", {
      multipart: {
        file: { name: png.filename, mimeType: png.mime, buffer: png.buffer },
      },
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as {
      files: Array<{ url: string; key: string; name: string; size: number; type: string }>;
    };
    expect(body.files).toHaveLength(1);
    const [file] = body.files;
    expect(typeof file!.url).toBe("string");
    expect(typeof file!.key).toBe("string");
    expect(file!.type).toBe("image/png");
    expect(file!.size).toBe(png.buffer.byteLength);
  });

  test("POST /api/uploadthing — 415 on wrong MIME", async ({
    loggedInPage,
    imageFactory,
  }) => {
    const txt = imageFactory.textBuffer();
    const res = await loggedInPage.request.post("/api/uploadthing", {
      multipart: {
        file: { name: txt.filename, mimeType: txt.mime, buffer: txt.buffer },
      },
    });
    expect(res.status()).toBe(415);
    expect((await res.json()) as { error: string }).toMatchObject({
      error: "unsupported-media-type",
    });
  });

  test("POST /api/uploadthing — 413 over the size cap", async ({
    loggedInPage,
    imageFactory,
  }) => {
    const big = imageFactory.oversizedBuffer();
    const res = await loggedInPage.request.post("/api/uploadthing", {
      multipart: {
        file: { name: big.filename, mimeType: big.mime, buffer: big.buffer },
      },
    });
    expect(res.status()).toBe(413);
    expect((await res.json()) as { error: string }).toMatchObject({
      error: "payload-too-large",
    });
  });

  test("POST /api/uploadthing — 400 when file field missing", async ({ loggedInPage }) => {
    const res = await loggedInPage.request.post("/api/uploadthing", {
      multipart: {},
    });
    expect(res.status()).toBe(400);
    expect((await res.json()) as { error: string }).toMatchObject({ error: "no-file" });
  });

  test("GET /api/uploadthing — advertises max bytes + allowed MIMEs", async ({ api }) => {
    // GET has no auth gate; it's pure metadata.
    const res = await api.get("/api/uploadthing");
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { maxBytes: number; allowedMimes: string[] };
    expect(body.maxBytes).toBeGreaterThan(0);
    expect(body.allowedMimes).toContain("image/png");
  });
});
