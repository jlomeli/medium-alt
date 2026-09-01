import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth/config";
import { renderTiptap, type TiptapDoc } from "@/lib/articles/tiptap";
import { TagChip } from "@/components/feed/TagChip";

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
        coverImageUrl: true,
        coverImageAlt: true,
        published: true,
        publishedAt: true,
        authorId: true,
        author: { select: { username: true, name: true } },
        tags: { select: { slug: true } },
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
        {/*
          Cover image hero. Rendered ABOVE the title per spec §
          Cover image / § UI surface. `alt=""` when the author left
          the alt blank — the image is decorative in that case, and
          an empty alt is the a11y-correct way to say "skip this."
          Using a plain `<img>` (not next/image) keeps the render
          path off any next.config allowlist — the URL is already
          gated by the server-side upload-host allowlist.
        */}
        {article.coverImageUrl && (
          <figure className="mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={article.coverImageUrl}
              alt={article.coverImageAlt ?? ""}
              className="w-full rounded-md object-cover"
            />
          </figure>
        )}
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
        {/*
          Body is a Zod-validated Tiptap doc (see
          docs/specs/articles-editor.md § Rendering). `renderTiptap`
          walks the same extension list the editor uses; the schema
          rejects every node/mark type and unsafe href before the doc
          reaches Prisma, so no post-render sanitizer runs here.
        */}
        {article.tags.length > 0 && (
          <ul aria-label="Tags" className="mt-4 flex flex-wrap gap-2">
            {article.tags
              .map((t) => t.slug)
              .sort()
              .map((slug) => (
                <li key={slug}>
                  <TagChip slug={slug} />
                </li>
              ))}
          </ul>
        )}
        <section
          aria-label="Body"
          className="prose mt-6 max-w-none"
          dangerouslySetInnerHTML={{
            __html: renderTiptap(article.body as unknown as TiptapDoc),
          }}
        />
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
