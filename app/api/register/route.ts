/**
 * POST /api/register — see docs/specs/auth.md §API surface.
 *
 * Duplicate email/username returns 400 with a field-scoped `code` so the UI can
 * anchor the error to the right input. Password is stored as argon2id hash.
 */
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { registerSchema } from "@/lib/validation/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);

  if (!parsed.success) {
    const first = parsed.error.issues[0]!;
    const field = (first.path[0] ?? "email") as string;
    return NextResponse.json(
      { error: { field, code: "invalid", message: first.message } },
      { status: 400 },
    );
  }

  const { email, username, password, name } = parsed.data;
  const passwordHash = await hashPassword(password);

  try {
    const user = await db.user.create({
      data: { email, username, passwordHash, name: name ?? null },
      select: { id: true, email: true, username: true },
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const target = (err.meta?.target as string[] | undefined) ?? [];
      if (target.includes("email")) {
        return NextResponse.json(
          { error: { field: "email", code: "email-taken" } },
          { status: 400 },
        );
      }
      if (target.includes("username")) {
        return NextResponse.json(
          { error: { field: "username", code: "username-taken" } },
          { status: 400 },
        );
      }
    }
    throw err;
  }
}
