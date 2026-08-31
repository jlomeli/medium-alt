/**
 * Storage adapter for user-uploaded images (slice 4c).
 *
 * Two implementations picked at module-load:
 * - **prod** — `UTApi.uploadFiles` pushes bytes to UploadThing. The
 *   returned `ufsUrl` + `key` are what the client persists on
 *   `Article.coverImageUrl` and Tiptap `image.attrs.src`.
 * - **E2E** — writes bytes to `test-results/uploads/<key>` and returns
 *   `http://localhost:3000/__test-uploads/<key>`. The gated
 *   `app/api/__test-uploads/[key]/route.ts` serves them back.
 *
 * Why a "server-side upload proxy" instead of UploadThing's client
 * presign flow: one storage code path, one auth boundary, no client
 * SDK dance to stub out under E2E. Trade: bytes traverse our server
 * once (5 MB cap keeps the RAM cost bounded). Acceptable at this
 * substrate's scale; revisit if traffic warrants direct presigned
 * uploads.
 */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { UTApi, UTFile } from "uploadthing/server";

export type UploadResult = {
  /** Public URL — always on the host allowlist. */
  url: string;
  /** UploadThing file key (or stub key). Used for deletion. */
  key: string;
  name: string;
  size: number;
  type: string;
};

export interface StorageAdapter {
  uploadFile(file: File): Promise<UploadResult>;
  deleteFiles(keys: string[]): Promise<void>;
}

// ---------- E2E stub ----------

/**
 * Root of the on-disk store for the E2E stub. Playwright's
 * `webServer` runs `next dev`, whose CWD is the repo root, so this
 * resolves to `<repo>/test-results/uploads/`. The `test-results`
 * directory is Playwright's convention; already gitignored.
 */
const STUB_UPLOAD_DIR = join(process.cwd(), "test-results", "uploads");

/**
 * Base URL the stub returns. Matches the gated GET route at
 * `app/api/__test-uploads/[key]/route.ts`. Extracted for the tests to
 * assert against without duplicating the string.
 */
export const STUB_UPLOAD_BASE_URL = "http://localhost:3000/__test-uploads/";

/**
 * Magic key that forces `E2EStubStorage.deleteFiles` to throw. The
 * article DELETE spec covers "cascade failure still returns 204 +
 * logs"; adding a magic key here is the smallest seam that exercises
 * that path without a control endpoint or env-var flipping in the
 * running server. Only meaningful inside the E2E stub — the real
 * UploadThing storage never sees this key.
 */
export const STUB_FORCE_DELETE_FAIL_KEY = "__force_delete_fail__";

class E2EStubStorage implements StorageAdapter {
  async uploadFile(file: File): Promise<UploadResult> {
    await mkdir(STUB_UPLOAD_DIR, { recursive: true });
    // Preserve the extension so `/__test-uploads/[key]` can guess a
    // Content-Type back on the way out.
    const ext = file.name.includes(".") ? file.name.slice(file.name.lastIndexOf(".")) : "";
    const key = `${randomUUID()}${ext}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    await writeFile(join(STUB_UPLOAD_DIR, key), bytes);
    return {
      url: `${STUB_UPLOAD_BASE_URL}${key}`,
      key,
      name: file.name,
      size: file.size,
      type: file.type,
    };
  }

  async deleteFiles(keys: string[]): Promise<void> {
    // Force-fail hook for the delete-cascade "failure still returns
    // 204" test. See STUB_FORCE_DELETE_FAIL_KEY docstring.
    if (keys.includes(STUB_FORCE_DELETE_FAIL_KEY)) {
      throw new Error(
        `E2E stub: forced deleteFiles failure (magic key present: ${STUB_FORCE_DELETE_FAIL_KEY})`,
      );
    }
    await Promise.all(
      keys.map(async (key) => {
        try {
          await unlink(join(STUB_UPLOAD_DIR, key));
        } catch {
          // Idempotent: a missing key is a no-op, same as the real
          // UTApi.deleteFiles semantics.
        }
      }),
    );
  }
}

// ---------- Production: UploadThing ----------

class UploadThingStorage implements StorageAdapter {
  private readonly api: UTApi;

  constructor() {
    // `UPLOADTHING_TOKEN` is read from env by the SDK itself.
    this.api = new UTApi();
  }

  async uploadFile(file: File): Promise<UploadResult> {
    // Wrap in UTFile so the SDK preserves the original filename.
    const utFile = new UTFile([await file.arrayBuffer()], file.name, { type: file.type });
    const result = await this.api.uploadFiles(utFile);
    if (result.error || !result.data) {
      throw new Error(
        `UploadThing upload failed: ${result.error?.message ?? "unknown error"}`,
      );
    }
    return {
      url: result.data.ufsUrl,
      key: result.data.key,
      name: result.data.name,
      size: result.data.size,
      type: file.type,
    };
  }

  async deleteFiles(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    await this.api.deleteFiles(keys);
  }
}

// ---------- Selector ----------

let cached: StorageAdapter | null = null;

/** Storage adapter singleton. E2E stub when `E2E=1`, real UploadThing otherwise. */
export function getStorage(): StorageAdapter {
  if (cached) return cached;
  cached = process.env.E2E === "1" ? new E2EStubStorage() : new UploadThingStorage();
  return cached;
}

// Exported for tests that need to reset the module-level cache
// between suites; not used from application code.
export function __resetStorageForTests(): void {
  cached = null;
}
