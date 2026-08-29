import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { ProfileHeader } from "@/components/profile/ProfileHeader";

/**
 * `/me` — signed-in dashboard. See docs/specs/profile.md.
 *
 * Renders name / username / bio / email plus an Edit link. Server component
 * gates the render behind `auth()`; unauthenticated visitors get bounced to
 * /login with a `callbackUrl` back to /me.
 */
export default async function MePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=%2Fme");
  }
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { email: true, username: true, name: true, bio: true },
  });
  if (!user) redirect("/login");

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="mb-6 font-serif text-3xl font-bold">Your profile</h1>
      <ProfileHeader name={user.name} username={user.username} bio={user.bio} />
      <p className="mt-6 text-sm text-neutral-600">
        Signed in as <span className="font-mono">{user.email}</span>.
      </p>
      <div className="mt-6">
        <Link
          href="/me/edit"
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-50"
        >
          Edit profile
        </Link>
      </div>
    </main>
  );
}
