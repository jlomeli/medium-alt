import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth/config";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { listPublishedArticlesByUsername } from "@/lib/articles/service";

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
      // `id` is included solely for the ownership comparison — it is NOT
      // rendered. Comparing on `username` breaks after a rename: the JWT
      // still carries the pre-rename value until the next sign-in, so the
      // real owner would see no Edit affordance until they logged out and
      // back in. `id` is immutable.
      select: { id: true, username: true, name: true, bio: true },
    }),
    auth(),
  ]);

  if (!user) notFound();

  const isOwner = session?.user?.id === user.id;
  // Same code path as GET /api/users/{username}/articles — the on-page
  // render and the public API can't drift. See docs/specs/articles-crud.md
  // § Public author listing.
  const articles = (await listPublishedArticlesByUsername(username)) ?? [];

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
      <section aria-label="Articles" className="mt-10">
        <h2 className="mb-4 font-serif text-2xl font-bold">Articles</h2>
        {articles.length === 0 ? (
          <p className="text-neutral-600">No published articles yet.</p>
        ) : (
          <ul className="flex flex-col gap-4">
            {articles.map((article) => (
              <li key={article.slug}>
                <Link
                  href={`/articles/${article.slug}`}
                  className="text-lg font-medium underline"
                >
                  {article.title}
                </Link>
                {article.subtitle && (
                  <p className="text-sm text-neutral-600">{article.subtitle}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
