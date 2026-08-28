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

/**
 * Placeholder hash used by the login flow when the requested email doesn't
 * exist. Running argon2.verify against it makes the wall-clock cost of a
 * "no such user" login attempt match that of a "wrong password" attempt, so
 * timing analysis can't distinguish registered emails from unknown ones.
 *
 * Pre-computed at development time (see scripts/gen-dummy-hash.mjs) rather
 * than hashed on demand. A lazy compute would pay the hash cost only on the
 * *first* cold-start unknown-email attempt, giving an attacker a distinct
 * ~200 ms signal on that request. As a compile-time constant, the cost of a
 * verify against this hash matches a verify against any real user's hash on
 * every request, cold or warm.
 *
 * The plaintext is `dummy-never-matches-a-real-password` — never a valid
 * password. `verifyPassword(DUMMY_PASSWORD_HASH, anything)` always returns
 * false.
 */
export const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,p=4,t=3$gxKEY0XRvsWqOTkfFfMCpA$ls+8pvi/UByQ+/T9nEJ/Mm8FCxTuZIKRH6ZX2rvOpgU";
