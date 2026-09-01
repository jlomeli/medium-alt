/**
 * POST /api/uploadthing — server-side upload proxy for the article
 * cover + inline image flows. See docs/specs/articles-images.md §
 * Upload endpoint.
 *
 * Shape: multipart form-data with a single `file` field. Response is
 * a JSON envelope `{ files: [{ url, key, name, size, type }] }`
 * mirroring UploadThing's client SDK convention so the client-side
 * uploader can stay agnostic to whether the storage is the real
 * UploadThing API or the local E2E stub.
 *
 * Errors — all keyed to a stable `{ error }` shape:
 * - 401 `unauthenticated` — no session cookie.
 * - 400 `no-file` — the `file` field is missing.
 * - 415 `unsupported-media-type` — MIME outside the allowlist.
 * - 413 `payload-too-large` — over the 5 MB cap.
 * - 500 `upload-failed` — the storage adapter rejected. The message
 *   is scrubbed of provider internals before it leaves the server.
 *
 * The auth gate runs before any storage call, so unauthenticated
 * requests never reach the (potentially remote) provider. That's the
 * property the API-level smoke test asserts.
 */
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { getStorage } from "@/lib/uploads/storage";
import {
  ALLOWED_UPLOAD_MIMES,
  MAX_UPLOAD_BYTES,
  isAllowedMime,
} from "@/lib/uploads/policy";

// Response envelope — kept in one place so the OpenAPI spec + the
// client `uploadImage` helper both reference the same shape.
type UploadRouteResponse = {
  files: Array<{
    url: string;
    key: string;
    name: string;
    size: number;
    type: string;
  }>;
};

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // `req.formData()` streams the multipart body. Anything that isn't
  // valid multipart throws — we catch and 400 rather than surface a
  // stack trace.
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "invalid-multipart" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "no-file" }, { status: 400 });
  }

  if (!isAllowedMime(file.type)) {
    return NextResponse.json(
      {
        error: "unsupported-media-type",
        allowed: ALLOWED_UPLOAD_MIMES,
      },
      { status: 415 },
    );
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      {
        error: "payload-too-large",
        maxBytes: MAX_UPLOAD_BYTES,
      },
      { status: 413 },
    );
  }

  const storage = getStorage();
  try {
    const result = await storage.uploadFile(file);
    // Record ownership. The DELETE-cascade filters keys through this
    // table so a copy-pasted URL from another user's article can't be
    // deleted through the shared UTApi client. See
    // docs/specs/articles-images.md § Delete-cascade (ownership).
    //
    // `upsert` (not `create`) is defensive: a retried request with the
    // same key must not 500 on the unique constraint. The storage
    // adapter guarantees fresh keys, so this branch is rare.
    await db.upload.upsert({
      where: { key: result.key },
      create: {
        key: result.key,
        url: result.url,
        ownerId: session.user.id,
      },
      update: {},
    });
    const body: UploadRouteResponse = { files: [result] };
    return NextResponse.json(body, { status: 200 });
  } catch (err) {
    // Deliberately opaque: the SDK's error messages sometimes carry
    // provider-side account hints we don't want to leak.
    console.error("[uploadthing] storage.uploadFile failed", err);
    return NextResponse.json({ error: "upload-failed" }, { status: 500 });
  }
}

/**
 * GET is used by UploadThing's client-side handshake in some
 * configurations to fetch route metadata. Our server-side proxy has
 * no negotiation surface — return the constraints so tooling can
 * introspect them (and the OpenAPI spec has a concrete GET to point
 * at). No auth needed: this describes what the route accepts, not
 * anyone's data.
 */
export async function GET(): Promise<Response> {
  return NextResponse.json({
    maxBytes: MAX_UPLOAD_BYTES,
    allowedMimes: ALLOWED_UPLOAD_MIMES,
  });
}
