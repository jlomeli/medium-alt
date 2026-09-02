import {
  listPopularTags,
  listPublishedFeed,
} from "@/lib/articles/service";
import {
  DEFAULT_FEED_LIMIT,
  DEFAULT_TAGS_LIMIT,
  MAX_FEED_LIMIT,
  decodeCursor,
} from "@/lib/validation/feed";
import { slugifyTag } from "@/lib/tags/slug";
import { FeedList } from "@/components/feed/FeedList";
import { PopularTags } from "@/components/feed/PopularTags";

/**
 * `/` — global published-articles feed with a popular-tags sidebar.
 * See docs/specs/tags-feed.md § UI surface.
 *
 * `?tag=<slug>` filters the feed and highlights the matching entry
 * in the sidebar. `?cursor=<opaque>` resumes pagination. A malformed
 * cursor renders the first page (rather than a 400) — visitors don't
 * write cursors by hand, and any bad value in the URL is either a
 * bookmark from an old deploy or a copy-paste error; falling back
 * beats a broken page.
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    tag?: string | string[];
    cursor?: string | string[];
    limit?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const rawTag = typeof params.tag === "string" ? params.tag : undefined;
  const rawCursor =
    typeof params.cursor === "string" ? params.cursor : undefined;
  const rawLimit =
    typeof params.limit === "string" ? params.limit : undefined;

  // Normalise the tag through the same slugifier the API uses so
  // `?tag=Software Testing` and `?tag=software-testing` resolve to the
  // same filtered feed. Empty-after-normalise (`?tag=!!!`) becomes
  // undefined — the sidebar's "Clear filter" doesn't render for it.
  const normalisedTag =
    rawTag !== undefined && rawTag.length > 0 ? slugifyTag(rawTag) : undefined;
  const tagFilter =
    normalisedTag && normalisedTag.length > 0 ? normalisedTag : undefined;

  let cursor;
  try {
    cursor = rawCursor ? decodeCursor(rawCursor) : undefined;
  } catch {
    cursor = undefined;
  }

  // Clamp URL-supplied limit into `[1, MAX_FEED_LIMIT]` and fall back
  // to the default for anything unparseable. Rejecting a bad limit here
  // (as the API does with a 400) would hard-fail the whole page render
  // — the URL bar is a shared surface between users and machines, and
  // a clamped read renders sensibly for both.
  const parsedLimit = rawLimit ? Number.parseInt(rawLimit, 10) : NaN;
  const limit =
    Number.isFinite(parsedLimit) && parsedLimit >= 1
      ? Math.min(parsedLimit, MAX_FEED_LIMIT)
      : DEFAULT_FEED_LIMIT;

  const [feed, popular] = await Promise.all([
    listPublishedFeed({ limit, cursor, tag: tagFilter }),
    listPopularTags(DEFAULT_TAGS_LIMIT),
  ]);

  const emptyMessage = tagFilter
    ? `No articles yet under #${tagFilter}.`
    : "No articles yet.";

  return (
    <main className="mx-auto grid max-w-5xl grid-cols-1 gap-10 p-6 md:grid-cols-[1fr_240px]">
      <section aria-labelledby="feed-heading">
        <h1
          id="feed-heading"
          className="mb-6 font-serif text-3xl font-bold"
        >
          {tagFilter ? `#${tagFilter}` : "Latest articles"}
        </h1>
        <FeedList
          items={feed.items}
          nextCursor={feed.nextCursor}
          tag={tagFilter}
          // Propagate the URL-supplied limit through to the follow-up
          // "Next" link so users don't silently jump back to the
          // default page size after clicking through. Omitted when the
          // reader is on the server default.
          limit={rawLimit ? limit : undefined}
          emptyMessage={emptyMessage}
        />
      </section>
      <PopularTags tags={popular} activeSlug={tagFilter} />
    </main>
  );
}
