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
 * The hash's plaintext is never a valid password — verify against it always
 * returns false. Lazily computed on first use so process startup stays cheap,
 * then cached at module scope.
 */
let dummyHashPromise: Promise<string> | null = null;
export function dummyPasswordHash(): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword("dummy-never-matches-a-real-password");
  }
  return dummyHashPromise;
}
