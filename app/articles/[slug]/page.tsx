import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth/config";

/**
 * `/articles/[slug]` — public read view. Drafts are visible only to
 * their author; every other viewer (signed-in or not) gets a real 404.
 */
export default async function ArticleReadPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [article, session] = await Promise.all([
    db.article.findUnique({
      where: { slug },
      // `authorId` is used ONLY for the ownership comparison below; it is
      // not rendered and doesn't leak in any response — this is a server
      // component, not an API surface.
      select: {
        slug: true,
        title: true,
        subtitle: true,
        body: true,
        published: true,
        publishedAt: true,
        authorId: true,
        author: { select: { username: true, name: true } },
      },
    }),
    auth(),
  ]);

  if (!article) notFound();

  const isAuthor = session?.user?.id === article.authorId;
  if (!article.published && !isAuthor) notFound();

  const authorLabel =
    article.author.name && article.author.username
      ? `${article.author.name} (@${article.author.username})`
      : (article.author.name ?? article.author.username ?? "Anonymous");

  return (
    <main className="mx-auto max-w-2xl p-6">
      <article>
        <h1 className="font-serif text-4xl font-bold">{article.title}</h1>
        {!article.published && (
          <p className="mt-2 inline-block rounded-md bg-yellow-100 px-2 py-0.5 text-sm text-yellow-900">
            Draft
          </p>
        )}
        {article.subtitle && (
          <section
            aria-label="Subtitle"
            className="mt-2 text-lg text-neutral-600"
          >
            {article.subtitle}
          </section>
        )}
        <section
          aria-label="Author"
          className="mt-4 text-sm text-neutral-500"
        >
          by {authorLabel}
          {article.publishedAt && (
            <>
              {" · "}
              <time dateTime={article.publishedAt.toISOString()}>
                {article.publishedAt.toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </time>
            </>
          )}
        </section>
        <section
          aria-label="Body"
          className="mt-6 whitespace-pre-wrap text-base leading-relaxed"
        >
          {article.body}
        </section>
      </article>
      {isAuthor && (
        <div className="mt-8">
          <Link
            href={`/articles/${article.slug}/edit`}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            Edit
          </Link>
        </div>
      )}
    </main>
  );
}
