/**
 * GET /api/__test-uploads/[key] — reads back an uploaded file from the
 * E2E stub's on-disk store. Gated on `E2E=1`; 404 in every other env
 * so a rogue request in prod (or an accidentally-persisted URL from a
 * dev branch) never hits the file system.
 *
 * Pair to `lib/uploads/storage.ts` § E2EStubStorage. The stub writes
 * uploads to `test-results/uploads/<key>` and returns the URL
 * `http://localhost:3000/__test-uploads/<key>`; the article
 * read-view's `<img src>` then flows through this route.
 *
 * See docs/specs/articles-images.md § Testing seams.
 */
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const STUB_UPLOAD_DIR = join(process.cwd(), "test-results", "uploads");

/**
 * Very small content-type table. The stub preserves the file's
 * extension in the key (see storage.ts § E2EStubStorage.uploadFile),
 * so a naïve lookup is enough — this route only runs under E2E.
 */
const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

function contentTypeFor(key: string): string {
  const dot = key.lastIndexOf(".");
  if (dot === -1) return "application/octet-stream";
  return CONTENT_TYPES[key.slice(dot).toLowerCase()] ?? "application/octet-stream";
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string }> },
): Promise<Response> {
  if (process.env.E2E !== "1") {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
  const { key } = await params;
  // Defense-in-depth path traversal check: resolve the join and confirm
  // the result is still inside STUB_UPLOAD_DIR. Next already decodes
  // path params but doesn't reject `..`.
  const filePath = resolve(join(STUB_UPLOAD_DIR, key));
  if (!filePath.startsWith(resolve(STUB_UPLOAD_DIR) + "/")) {
    return NextResponse.json({ error: "bad-key" }, { status: 400 });
  }
  try {
    const bytes = await readFile(filePath);
    // Convert Node Buffer to a Uint8Array so NextResponse's BodyInit
    // typing is satisfied (Buffer is not itself a valid BodyInit
    // under lib.dom).
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "Content-Type": contentTypeFor(key),
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }
}
