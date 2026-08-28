/**
 * Reject anything that isn't a same-origin path. Used by the auth pages to
 * validate `?callbackUrl=`; see spec acceptance criteria under Login.
 *
 * Same-origin means a path that starts with `/` and not `//` (protocol-relative)
 * — no absolute URLs, no javascript:, no data:, etc.
 */
export function safeCallbackUrl(candidate: string | null | undefined, fallback = "/"): string {
  if (!candidate) return fallback;
  if (!candidate.startsWith("/") || candidate.startsWith("//")) return fallback;
  return candidate;
}
