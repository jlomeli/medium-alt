/**
 * Upload constraints shared by the server route + the client-side
 * pre-check hook. Kept in one file so a bump to the MIME allowlist or
 * the size cap flows to both sides without them drifting.
 *
 * See docs/specs/articles-images.md § Non-goals ("MIME allowlist is
 * images only") and § Upload endpoint ("5 MB cap").
 */

/** 5 MB. Enforced server-side; the client hook also checks so the
 *  user sees an immediate error instead of a wasted round-trip. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

/** JPEG / PNG / WebP / GIF only. No SVG (script surface), no HEIC
 *  (browser-support asymmetry), no video/audio (§ Non-goals). */
export const ALLOWED_UPLOAD_MIMES: readonly string[] = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

export function isAllowedMime(type: unknown): boolean {
  return typeof type === "string" && ALLOWED_UPLOAD_MIMES.includes(type);
}

/** For form-level "accept" attrs. */
export const UPLOAD_ACCEPT_ATTR = ALLOWED_UPLOAD_MIMES.join(",");
