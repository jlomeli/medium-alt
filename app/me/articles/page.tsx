import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth/config";

/**
 * `/me/articles` — signed-in user's own articles (drafts + published).
 * Rendered as a semantic `<table>` so tests can query rows and cells by
 * accessible name.
 */
export default async function MyArticlesPage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=%2Fme%2Farticles");
  }

  const articles = await db.article.findMany({
    where: { authorId: session.user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      slug: true,
      title: true,
      published: true,
      updatedAt: true,
    },
  });

  return (
    <main className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-serif text-3xl font-bold">Your articles</h1>
        <Link
          href="/articles/new"
          className="rounded-md bg-black px-3 py-1.5 text-sm text-white hover:bg-neutral-800"
        >
          New article
        </Link>
      </div>

      {articles.length === 0 ? (
        <p className="text-neutral-600">
          You haven&rsquo;t written anything yet.{" "}
          <Link href="/articles/new" className="underline">
            Start a draft
          </Link>
          .
        </p>
      ) : (
        <table aria-label="Your articles" className="w-full border-collapse">
          <thead className="border-b text-left text-sm text-neutral-500">
            <tr>
              <th className="py-2">Title</th>
              <th className="py-2">Status</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {articles.map((article) => (
              <tr key={article.slug} className="border-b">
                <td className="py-3">{article.title}</td>
                <td className="py-3 text-sm">
                  {article.published ? "Published" : "Draft"}
                </td>
                <td className="py-3 text-sm">
                  {article.published ? (
                    <Link
                      href={`/articles/${article.slug}`}
                      className="mr-3 underline"
                    >
                      View
                    </Link>
                  ) : null}
                  <Link
                    href={`/articles/${article.slug}/edit`}
                    className="underline"
                  >
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
