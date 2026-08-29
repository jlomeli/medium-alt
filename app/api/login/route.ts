/**
 * POST /api/login — see docs/specs/auth-api.md.
 *
 * First-party JSON contract over Auth.js Credentials sign-in. Wraps the
 * same primitive `next-auth/react`'s `signIn()` uses in the browser, so
 * the JWT cookie and downstream session behavior are identical. The
 * anti-enumeration property (byte-identical response for wrong-password
 * vs. unknown-email) is preserved by delegating to `authorize()` in
 * lib/auth/config.ts, which runs argon2 against `DUMMY_PASSWORD_HASH`
 * on cache-misses.
 */
import { NextResponse } from "next/server";
import { AuthError } from "next-auth";
import { db } from "@/lib/db";
import { signIn } from "@/lib/auth/config";
import { loginSchema } from "@/lib/validation/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);

  if (!parsed.success) {
    const first = parsed.error.issues[0]!;
    const field = (first.path[0] ?? "email") as string;
    return NextResponse.json(
      { error: { field, code: "invalid", message: first.message } },
      { status: 400 },
    );
  }

  const { email, password } = parsed.data;

  try {
    await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
  } catch (err) {
    // Auth.js throws `AuthError` (usually `CredentialsSignin`) when
    // authorize() returns null. Any other throw is an infrastructure
    // failure and should propagate as a 500.
    if (err instanceof AuthError) {
      return NextResponse.json({ error: "invalid-credentials" }, { status: 401 });
    }
    throw err;
  }

  // authorize() returned a user + Auth.js set the JWT cookie. Look up the
  // public shape for the response body.
  const user = await db.user.findUnique({
    where: { email },
    select: { id: true, email: true, username: true },
  });
  // Should be present given signIn succeeded, but be defensive.
  if (!user) {
    return NextResponse.json({ error: "invalid-credentials" }, { status: 401 });
  }

  return NextResponse.json({ user });
}
