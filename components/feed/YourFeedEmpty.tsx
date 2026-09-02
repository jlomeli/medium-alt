import Link from "next/link";

/**
 * `<YourFeedEmpty>` — the empty state for `/?feed=me` when the
 * signed-in viewer follows nobody yet.
 *
 * Two `getByRole('link')` CTAs (Global + Popular tags anchor) per the
 * acceptance criteria in docs/specs/follow.md. Honest empty state,
 * no fall-through to the global feed — hiding the follow mechanic
 * would make it harder to test and less honest to the user.
 */
export function YourFeedEmpty() {
  return (
    <div className="rounded-md border border-dashed border-neutral-300 p-6">
      <h2 className="mb-2 font-medium">You aren&apos;t following anyone yet.</h2>
      <p className="mb-4 text-sm text-neutral-600">
        Follow authors to see their latest articles here. In the meantime:
      </p>
      <ul className="flex flex-col gap-2 text-sm">
        <li>
          <Link href="/" className="underline">
            Browse the Global feed
          </Link>
        </li>
        <li>
          {/* Anchors the Popular tags sidebar block below the fold on
              small screens; on desktop the sidebar is already visible
              on the right, but the link is still a real navigation
              target for keyboard users. */}
          <Link href="#popular-tags" className="underline">
            Explore Popular tags
          </Link>
        </li>
      </ul>
    </div>
  );
}
