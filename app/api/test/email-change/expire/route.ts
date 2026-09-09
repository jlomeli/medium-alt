/**
 * DEV/E2E-ONLY test seam — see docs/specs/account-security.md § Testing
 * seams. Mirrors `app/api/test/password-reset/expire/route.ts` in every
 * respect (same guard, same body shape) so the E2E suite has one
 * pattern for "advance the DB clock past a token's expiry."
 *
 * The seam is enabled iff:
 *   - `E2E === "1"`, AND
 *   - `VERCEL_ENV !== "production"`, AND
 *   - `NODE_ENV !== "production"` UNLESS `VERCEL_ENV === "preview"`
 *     (Vercel preview builds always set `NODE_ENV=production`).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hash as hashToken } from "@/lib/auth/reset-token";

const inputSchema = z.object({ token: z.string().min(1) });

function isEnabled(): boolean {
  if (process.env.E2E !== "1") return false;
  if (process.env.VERCEL_ENV === "production") return false;
  if (process.env.VERCEL_ENV === "preview") return true;
  return process.env.NODE_ENV !== "production";
}

export async function POST(req: Request) {
  if (!isEnabled()) {
    return NextResponse.json({ error: "not-found" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad-request" }, { status: 400 });
  }

  const row = await db.pendingEmailChange.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
  });
  if (!row) return NextResponse.json({ error: "not-found" }, { status: 404 });

  await db.pendingEmailChange.update({
    where: { id: row.id },
    data: { expiresAt: new Date(Date.now() - 60_000) },
  });

  return NextResponse.json({ ok: true });
}
