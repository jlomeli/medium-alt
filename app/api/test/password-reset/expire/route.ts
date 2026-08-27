/**
 * DEV/E2E-ONLY test seam.
 *
 * Documented in docs/specs/auth.md §Testing seams. Returns 404 unless
 *   - process.env.E2E === "1", AND
 *   - VERCEL_ENV is unset or "preview" (never "production")
 * so it can never be hit from a real production deployment. Vercel preview
 * deployments must set E2E=1 in project env vars for this seam to activate.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hash as hashToken } from "@/lib/auth/reset-token";

const inputSchema = z.object({ token: z.string().min(1) });

function isEnabled() {
  const isProd = process.env.VERCEL_ENV === "production";
  return !isProd && process.env.E2E === "1";
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
