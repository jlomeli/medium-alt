/**
 * Password hashing — argon2id, library defaults.
 *
 * Tunable: if Vercel cold-start login latency > 250 ms in practice, drop
 * `memoryCost` to 32 MiB. See docs/specs/auth.md §Password policy.
 */
import argon2 from "argon2";

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // Malformed hash or verification failure — treated as a mismatch, never
    // as a 500. Login endpoints return the same generic error either way.
    return false;
  }
}
