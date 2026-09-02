import Link from "next/link";
import type { PublicArticleSummary } from "@/lib/articles/service";
import { ArticleCard } from "./ArticleCard";

/**
 * `<FeedList>` — a list of `<ArticleCard>` rows plus a "Next" link
 * that navigates to the next cursor.
 *
 * Server-driven pagination: the "Next" affordance is a plain `<Link>`
 * to `?cursor=<next>` rather than a fetch-in-place. That keeps the
 * component free of client state (no `useState` for `items`, no
 * loading spinner to reason about) and gives readers a shareable URL
 * for every page. Trade-off: navigating replaces the whole page
 * rather than appending. For a Medium-shape feed the perceived cost
 * is small; the code simplicity is worth it.
 */
export function FeedList({
  items,
  nextCursor,
  tag,
  limit,
  emptyMessage,
}: {
  items: PublicArticleSummary[];
  nextCursor: string | null;
  /** Preserve the current tag filter across pagination. */
  tag?: string;
  /**
   * Preserve the current `?limit=` across pagination. Undefined means
   * the page is using the server default — omit it from the follow-up
   * URL so a future default change is honoured on the next click.
   */
  limit?: number;
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return <p className="text-neutral-600">{emptyMessage}</p>;
  }

  // Build the ?cursor= link URL, preserving `?tag=` and `?limit=` when set.
  const nextHref = nextCursor
    ? "/?" +
      new URLSearchParams({
        ...(tag ? { tag } : {}),
        ...(limit ? { limit: String(limit) } : {}),
        cursor: nextCursor,
      }).toString()
    : null;

  return (
    <div>
      <ul className="flex flex-col gap-6" aria-label="Articles">
        {items.map((article) => (
          <li key={article.slug}>
            <ArticleCard article={article} />
          </li>
        ))}
      </ul>
      {nextHref && (
        <div className="mt-8">
          <Link
            href={nextHref}
            rel="next"
            className="inline-block rounded-md border px-4 py-2 text-sm hover:bg-neutral-50"
          >
            Next
          </Link>
        </div>
      )}
    </div>
  );
}
