import { redirect } from "next/navigation";
import {
  listFollowedFeed,
  listPopularTags,
  listPublishedFeed,
} from "@/lib/articles/service";
import { auth } from "@/lib/auth/config";
import {
  DEFAULT_FEED_LIMIT,
  DEFAULT_TAGS_LIMIT,
  MAX_FEED_LIMIT,
  decodeCursor,
} from "@/lib/validation/feed";
import { slugifyTag } from "@/lib/tags/slug";
import { FeedList } from "@/components/feed/FeedList";
import { FeedTabs } from "@/components/feed/FeedTabs";
import { PopularTags } from "@/components/feed/PopularTags";
import { YourFeedEmpty } from "@/components/feed/YourFeedEmpty";

/**
 * `/` — global published-articles feed with a popular-tags sidebar.
 * See docs/specs/tags-feed.md § UI surface and docs/specs/follow.md.
 *
 * Slice 5: `?tag=<slug>` filters the feed, `?cursor=<opaque>` resumes
 * pagination. A malformed cursor renders the first page (rather than
 * a 400) — visitors don't write cursors by hand, and any bad value
 * is either a bookmark from an old deploy or a copy-paste error;
 * falling back beats a broken page.
 *
 * Slice 6: `?feed=me` switches the feed to Your Feed (published
 * articles from authors the viewer follows). Anonymous on `?feed=me`
 * → redirect to `/login?callbackUrl=/%3Ffeed%3Dme`. The `?tag=` param
 * is meaningful only on the Global tab — `?feed=me&tag=x` silently
 * ignores the tag (spec § Acceptance criteria).
 */
export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    tag?: string | string[];
    cursor?: string | string[];
    limit?: string | string[];
    feed?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const rawTag = typeof params.tag === "string" ? params.tag : undefined;
  const rawCursor =
    typeof params.cursor === "string" ? params.cursor : undefined;
  const rawLimit =
    typeof params.limit === "string" ? params.limit : undefined;
  const rawFeed = typeof params.feed === "string" ? params.feed : undefined;

  const session = await auth();
  const isYourFeed = rawFeed === "me";

  // Anonymous on Your Feed → send to login. `callbackUrl` round-trips
  // them back to `/?feed=me` after sign-in. `redirect()` throws, so
  // nothing below runs.
  if (isYourFeed && !session?.user) {
    redirect(`/login?callbackUrl=${encodeURIComponent("/?feed=me")}`);
  }

  // Normalise the tag through the same slugifier the API uses so
  // `?tag=Software Testing` and `?tag=software-testing` resolve to the
  // same filtered feed. Empty-after-normalise (`?tag=!!!`) becomes
  // undefined — the sidebar's "Clear filter" doesn't render for it.
  const normalisedTag =
    rawTag !== undefined && rawTag.length > 0 ? slugifyTag(rawTag) : undefined;
  // Your Feed intentionally ignores `?tag=` (spec § Acceptance criteria)
  // — the tag chip on a Your-Feed card links to `/?tag=<slug>`, which
  // switches back to Global with the filter applied.
  const tagFilter =
    !isYourFeed && normalisedTag && normalisedTag.length > 0
      ? normalisedTag
      : undefined;

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
    isYourFeed
      ? listFollowedFeed({ viewerId: session!.user!.id, limit, cursor })
      : listPublishedFeed({ limit, cursor, tag: tagFilter }),
    listPopularTags(DEFAULT_TAGS_LIMIT),
  ]);

  const emptyMessage = tagFilter
    ? `No articles yet under #${tagFilter}.`
    : "No articles yet.";
  const heading = isYourFeed
    ? "Your Feed"
    : tagFilter
      ? `#${tagFilter}`
      : "Latest articles";

  return (
    <main className="mx-auto grid max-w-5xl grid-cols-1 gap-10 p-6 md:grid-cols-[1fr_240px]">
      <section aria-labelledby="feed-heading">
        {/* Tabs render only when there's a session — anonymous
            visitors see the pre-slice-6 layout unchanged. */}
        {session?.user && (
          <FeedTabs active={isYourFeed ? "you" : "global"} />
        )}
        <h1
          id="feed-heading"
          className="mb-6 font-serif text-3xl font-bold"
        >
          {heading}
        </h1>
        {isYourFeed && feed.items.length === 0 && !cursor ? (
          // Empty-state view is only shown on page 1 (no cursor). A
          // deep-link to a later page of Your Feed that happens to be
          // empty (unusual: means the viewer unfollowed everyone
          // between clicks) falls through to the generic empty message
          // below.
          <YourFeedEmpty />
        ) : (
          <FeedList
            items={feed.items}
            nextCursor={feed.nextCursor}
            tag={tagFilter}
            feed={isYourFeed ? "me" : undefined}
            // Propagate the URL-supplied limit through to the follow-up
            // "Next" link so users don't silently jump back to the
            // default page size after clicking through. Omitted when the
            // reader is on the server default.
            limit={rawLimit ? limit : undefined}
            emptyMessage={
              isYourFeed
                ? "No more articles from authors you follow."
                : emptyMessage
            }
          />
        )}
      </section>
      <PopularTags tags={popular} activeSlug={tagFilter} />
    </main>
  );
}
