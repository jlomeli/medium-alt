/**
 * Client-side uploader — the single call-site both `<CoverImageField>`
 * and the editor's "Add image" flow use to push a File to
 * `/api/uploadthing` and get back a URL to persist.
 *
 * Returns `{ ok: true, url, key, ... }` on success, or
 * `{ ok: false, code, message }` on failure. Codes match the server
 * route's error keys; callers surface them via `role="alert"` copy so
 * upload failures are discoverable (see docs/specs/articles-images.md
 * § Acceptance criteria — "Upload endpoint").
 */
import {
  ALLOWED_UPLOAD_MIMES,
  MAX_UPLOAD_BYTES,
  isAllowedMime,
} from "@/lib/uploads/policy";

export type UploadSuccess = {
  ok: true;
  url: string;
  key: string;
  name: string;
  size: number;
  type: string;
};

export type UploadFailure = {
  ok: false;
  /**
   * `unsupported-media-type` and `payload-too-large` line up with the
   * server's error strings; `network` is client-only (fetch itself
   * rejected). `unknown` covers everything else and prints the
   * server's message for the alert.
   */
  code:
    | "unsupported-media-type"
    | "payload-too-large"
    | "unauthenticated"
    | "no-file"
    | "network"
    | "unknown";
  message: string;
};

export type UploadResult = UploadSuccess | UploadFailure;

/**
 * Human-readable copy for each failure code. Kept beside the codes so
 * the alert text stays consistent whether the check fires client-side
 * (before the request) or server-side (after).
 */
export const UPLOAD_ERROR_COPY: Record<UploadFailure["code"], string> = {
  "unsupported-media-type": `Only these image types are allowed: ${ALLOWED_UPLOAD_MIMES.join(", ")}.`,
  "payload-too-large": `Image is too large. Max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB.`,
  unauthenticated: "You need to be signed in to upload images.",
  "no-file": "No file was selected.",
  network: "Upload failed — please check your connection and try again.",
  unknown: "Upload failed — please try again.",
};

/**
 * Pre-flight check without touching the network. Fires on the
 * `<input type="file">` change event so oversized / wrong-type
 * selections surface an alert without a wasted upload attempt.
 */
export function preflight(file: File): UploadFailure | null {
  if (!isAllowedMime(file.type)) {
    return {
      ok: false,
      code: "unsupported-media-type",
      message: UPLOAD_ERROR_COPY["unsupported-media-type"],
    };
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      code: "payload-too-large",
      message: UPLOAD_ERROR_COPY["payload-too-large"],
    };
  }
  return null;
}

/**
 * POSTs the file to `/api/uploadthing` and normalizes the response
 * into the discriminated `UploadResult` type.
 */
export async function uploadImage(file: File): Promise<UploadResult> {
  const pre = preflight(file);
  if (pre) return pre;

  const form = new FormData();
  form.append("file", file);

  let response: Response;
  try {
    response = await fetch("/api/uploadthing", {
      method: "POST",
      body: form,
    });
  } catch {
    return { ok: false, code: "network", message: UPLOAD_ERROR_COPY.network };
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    const rawCode = payload?.error ?? "unknown";
    const code: UploadFailure["code"] =
      rawCode === "unsupported-media-type" ||
      rawCode === "payload-too-large" ||
      rawCode === "unauthenticated" ||
      rawCode === "no-file"
        ? rawCode
        : "unknown";
    return { ok: false, code, message: UPLOAD_ERROR_COPY[code] };
  }

  const payload = (await response.json().catch(() => null)) as {
    files?: Array<UploadSuccess>;
  } | null;
  const first = payload?.files?.[0];
  if (!first || typeof first.url !== "string" || typeof first.key !== "string") {
    return { ok: false, code: "unknown", message: UPLOAD_ERROR_COPY.unknown };
  }
  return {
    ok: true,
    url: first.url,
    key: first.key,
    name: first.name,
    size: first.size,
    type: first.type,
  };
}
