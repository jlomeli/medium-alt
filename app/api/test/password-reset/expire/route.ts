/**
 * DEV/E2E-ONLY test seam.
 *
 * Documented in docs/specs/auth.md §Testing seams. Guard is belt-and-
 * suspenders — a non-Vercel deployment with `NODE_ENV=production` and a
 * stray `E2E=1` would otherwise expose an unauthenticated endpoint that
 * can invalidate any reset token an attacker holds.
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
  // Explicit Vercel production always disabled.
  if (process.env.VERCEL_ENV === "production") return false;
  // Vercel preview is the one case where NODE_ENV=production is allowed.
  if (process.env.VERCEL_ENV === "preview") return true;
  // Any other environment: refuse if NODE_ENV signals production.
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

  const row = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(parsed.data.token) },
  });
  if (!row) return NextResponse.json({ error: "not-found" }, { status: 404 });

  await db.passwordResetToken.update({
    where: { id: row.id },
    data: { expiresAt: new Date(Date.now() - 60_000) },
  });

  return NextResponse.json({ ok: true });
}
