import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth/config";
import { ProfileHeader } from "@/components/profile/ProfileHeader";

/**
 * `/profiles/:username` — public profile.
 *
 * Unknown username → `notFound()` triggers Next's `not-found.tsx` render
 * with a real 404 status (not a soft-404 on 200).
 */
export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const [user, session] = await Promise.all([
    db.user.findUnique({
      where: { username },
      select: { username: true, name: true, bio: true },
    }),
    auth(),
  ]);

  if (!user) notFound();

  const isOwner = session?.user?.username === user.username;

  return (
    <main className="mx-auto max-w-2xl p-6">
      <ProfileHeader name={user.name} username={user.username} bio={user.bio} />
      {isOwner && (
        <div className="mt-6">
          <Link
            href="/me/edit"
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            Edit profile
          </Link>
        </div>
      )}
    </main>
  );
}
