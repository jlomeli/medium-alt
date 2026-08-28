/**
 * Password-reset token helpers.
 *
 * - `generate()` returns `{ raw, hash }`. Only `hash` is stored; `raw` goes in
 *   the emailed link.
 * - `hash(raw)` recomputes the sha256 for lookup on confirm.
 *
 * See docs/specs/auth.md §API surface for the flow.
 */
import { createHash, randomBytes } from "node:crypto";

/** 32 bytes = 64 hex chars; sha256(hash) is also 64 chars. */
export function generate(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("hex");
  return { raw, hash: hash(raw) };
}

export function hash(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/** Reset token TTL — 1 hour. */
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;
