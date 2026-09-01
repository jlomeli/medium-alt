import Link from "next/link";

/**
 * `<TagChip>` — small "pill" link to a tag-filtered feed. Used on
 * article cards, the article read page, and the popular-tags sidebar.
 *
 * Rendered as an anchor with `rel="tag"` so the link is
 * machine-recognisable and accessible-name-carrying (screen readers
 * announce "link, #<slug>"). Keeps the visual affordance consistent
 * across surfaces so styling changes touch one file.
 */
export function TagChip({ slug }: { slug: string }) {
  return (
    <Link
      href={`/?tag=${encodeURIComponent(slug)}`}
      rel="tag"
      className="inline-block rounded-full border border-neutral-300 px-2.5 py-0.5 text-xs text-neutral-700 hover:bg-neutral-100"
    >
      #{slug}
    </Link>
  );
}
