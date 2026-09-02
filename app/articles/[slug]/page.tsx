import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/db";
import { auth } from "@/lib/auth/config";
import { renderTiptap, type TiptapDoc } from "@/lib/articles/tiptap";
import { TagChip } from "@/components/feed/TagChip";
import { ClapButton } from "@/components/claps/ClapButton";
import { ClapCount } from "@/components/claps/ClapCount";
import {
  getViewerClapState,
  sumClapsForArticle,
} from "@/lib/claps/service";

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
      // `authorId` is used ONLY for the ownership comparison below; `id`
      // for the slice-7 clap aggregate. Neither is rendered and neither
      // leaks in any response — this is a server component, not an API
      // surface.
      select: {
        id: true,
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

  // Slice 7 — clap aggregate + optional viewer state. Skip the viewer
  // read entirely when anonymous or when the viewer is the author
  // (self-clap is impossible; the author never has a Clap row for
  // their own article). Parallelised so the read view waits once,
  // not twice, on the DB.
  const viewerId = !isAuthor ? session?.user?.id : undefined;
  const [clapCount, viewerClapState] = await Promise.all([
    sumClapsForArticle(article.id),
    viewerId
      ? getViewerClapState(viewerId, article.id)
      : Promise.resolve(null),
  ]);

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
      {/*
        Slice 7 — clap affordance. Three render variants, decided
        here (RSC) so the DOM difference between "own article",
        "anonymous", and "signed-in reader" is a compile-time
        property of this file, not a runtime branch inside the
        client component:
          - Author viewing own article → static `<ClapCount>`
            only. No button in the DOM at all (spec § UI surface).
          - Anonymous viewer → `<ClapButton variant="anonymous">`
            renders a link to /login. No JS needed.
          - Signed-in non-author → `<ClapButton variant="signed-in">`
            with optimistic UI.
        The wrapping `<section aria-label="Claps">` scopes POM
        reads so the button, count, and error alert can be located
        without a testid.
      */}
      {article.published && (
        <section aria-label="Claps" className="mt-8">
          {isAuthor ? (
            <ClapCount count={clapCount} label="Total claps" />
          ) : session?.user ? (
            <ClapButton
              variant="signed-in"
              slug={article.slug}
              initialViewerCount={viewerClapState?.clapCount ?? 0}
              initialTotalCount={clapCount}
            />
          ) : (
            <ClapButton
              variant="anonymous"
              slug={article.slug}
              initialTotalCount={clapCount}
              articlePath={`/articles/${article.slug}`}
            />
          )}
        </section>
      )}
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
