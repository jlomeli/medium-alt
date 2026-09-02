import Link from "next/link";
import type { PublicArticleSummary } from "@/lib/articles/service";
import { ClapCount } from "@/components/claps/ClapCount";
import { TagChip } from "./TagChip";

/**
 * `<ArticleCard>` — feed row. Title + subtitle + author line +
 * publishedAt + tag chips, all linking to `/articles/[slug]`.
 *
 * Rendered as `<article>` so screen readers can announce it as a
 * discrete entry in the feed. The title link is inside an `<h2>`
 * for landmark navigation.
 */
export function ArticleCard({ article }: { article: PublicArticleSummary }) {
  const authorLabel =
    article.author.name && article.author.username
      ? `${article.author.name} (@${article.author.username})`
      : (article.author.name ?? article.author.username ?? "Anonymous");

  return (
    <article className="border-b border-neutral-200 pb-6">
      <h2 className="font-serif text-2xl font-bold">
        <Link href={`/articles/${article.slug}`} className="hover:underline">
          {article.title}
        </Link>
      </h2>
      {article.subtitle && (
        <p className="mt-1 text-neutral-600">{article.subtitle}</p>
      )}
      <p className="mt-2 flex flex-wrap items-center gap-x-2 text-sm text-neutral-500">
        <span>by {authorLabel}</span>
        {article.publishedAt && (
          <>
            <span aria-hidden="true">·</span>
            <time dateTime={article.publishedAt.toISOString()}>
              {article.publishedAt.toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
          </>
        )}
        {/*
          Slice 7 — aggregate clap count on every card. Rendered
          even when zero (spec § Clap counts on feed cards:
          "consistency beats subtly-different empty states"). The
          number carries `aria-label="Clap count"` via `<ClapCount>`
          so tests find it with `getByLabel` without a testid.
        */}
        <span aria-hidden="true">·</span>
        <ClapCount count={article.clapCount} />
      </p>
      {article.tags.length > 0 && (
        <ul aria-label="Tags" className="mt-3 flex flex-wrap gap-2">
          {article.tags.map((slug) => (
            <li key={slug}>
              <TagChip slug={slug} />
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
