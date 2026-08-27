/**
 * POST /api/logout — dedicated logout endpoint.
 *
 * Auth.js v5's server-action `signOut()` doesn't reliably attach the
 * `Set-Cookie: authjs.session-token=; Max-Age=0` header to the outgoing
 * response (the cookie deletion is applied to the request scope only, so the
 * server-rendered Header sees no session but the browser jar still has it).
 *
 * This handler wraps `signOut()` inside a Route Handler context, where the
 * cookie deletion propagates correctly to the response, then issues a 303
 * back to `/`. The `<form action="/api/logout">` in the AccountMenu means the
 * browser follows the redirect and applies the Set-Cookie in one round-trip.
 */
import { NextResponse } from "next/server";
import { signOut } from "@/lib/auth/config";

export async function POST(req: Request) {
  await signOut({ redirect: false });
  const url = new URL("/", req.url);
  return NextResponse.redirect(url, { status: 303 });
}
