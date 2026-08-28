/**
 * POST /api/logout — dedicated logout endpoint.
 *
 * Auth.js v5's server-action `signOut()` clears the JWT cookie via
 * `cookies().delete(...)` from next/headers, which mutates the *request*
 * scope. Under load that mutation doesn't reliably propagate onto a fresh
 * `NextResponse.redirect()` — the browser sees a 303 with no Set-Cookie and
 * the JWT persists.
 *
 * We call `signOut()` for its server-side bookkeeping (session invalidation,
 * event hooks) and then explicitly attach the cookie-clear to the redirect
 * response so the outgoing headers can't lose them.
 */
import { signOut } from "@/lib/auth/config";

// Auth.js v5 cookie names — both prefixes ship in the wild; we clear both to
// tolerate the prod-`__Secure-`-prefixed variant Auth.js issues over HTTPS.
const AUTH_COOKIE_NAMES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "authjs.csrf-token",
  "__Host-authjs.csrf-token",
  "authjs.callback-url",
  "__Secure-authjs.callback-url",
] as const;

export async function POST(req: Request) {
  await signOut({ redirect: false });
  const url = new URL("/", req.url);
  // Build the redirect from a plain Response so the Set-Cookie headers we
  // attach can't collide with anything NextResponse.redirect() bakes in.
  const headers = new Headers({ Location: url.toString() });
  for (const name of AUTH_COOKIE_NAMES) {
    headers.append(
      "Set-Cookie",
      `${name}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax${
        url.protocol === "https:" ? "; Secure" : ""
      }`,
    );
  }
  return new Response(null, { status: 303, headers });
}
