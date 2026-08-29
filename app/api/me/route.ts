/**
 * GET / PATCH /api/me — see docs/specs/profile.md §API surface.
 *
 * GET returns the current user's public+private profile shape. PATCH
 * accepts a partial update; duplicate-username collision emits the same
 * `{ field: "username", code: "username-taken" }` shape as /api/register
 * so client-side field-error wiring is symmetric.
 */
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth/config";
import { updateMeSchema } from "@/lib/validation/profile";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, username: true, name: true, bio: true },
  });
  if (!user) return NextResponse.json({ error: "not-found" }, { status: 404 });
  return NextResponse.json(user);
}

export async function PATCH(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = updateMeSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0]!;
    const field = (first.path[0] ?? "form") as string;
    return NextResponse.json(
      { error: { field, code: "invalid", message: first.message } },
      { status: 400 },
    );
  }

  try {
    const updated = await db.user.update({
      where: { id: session.user.id },
      data: parsed.data,
      select: { id: true, email: true, username: true, name: true, bio: true },
    });
    return NextResponse.json(updated);
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === "P2002" &&
      ((err.meta?.target as string[] | undefined) ?? []).includes("username")
    ) {
      return NextResponse.json(
        { error: { field: "username", code: "username-taken" } },
        { status: 400 },
      );
    }
    throw err;
  }
}
