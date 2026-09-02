import Link from "next/link";
import type { PopularTag } from "@/lib/articles/service";

/**
 * `<PopularTags>` — sidebar list. Each entry links to the tag-
 * filtered home feed. The current filter (`activeSlug`) gets an
 * `aria-current` marker + a solid-fill treatment so screen-reader
 * users and sighted users see the same "you are here."
 */
export function PopularTags({
  tags,
  activeSlug,
}: {
  tags: PopularTag[];
  activeSlug?: string;
}) {
  return (
    <aside id="popular-tags" aria-labelledby="popular-tags-heading" className="sticky top-6">
      <h2
        id="popular-tags-heading"
        className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500"
      >
        Popular tags
      </h2>
      {tags.length === 0 ? (
        <p className="text-sm text-neutral-500">No tags yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {tags.map((tag) => {
            const isActive = tag.slug === activeSlug;
            return (
              <li key={tag.slug}>
                <Link
                  href={`/?tag=${encodeURIComponent(tag.slug)}`}
                  aria-current={isActive ? "page" : undefined}
                  className={
                    isActive
                      ? "flex items-center justify-between rounded-md bg-neutral-900 px-2 py-1 text-sm text-white"
                      : "flex items-center justify-between rounded-md px-2 py-1 text-sm text-neutral-700 hover:bg-neutral-100"
                  }
                >
                  <span>#{tag.slug}</span>
                  <span className="text-xs opacity-70">{tag.count}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      {activeSlug !== undefined && (
        <p className="mt-4">
          <Link href="/" className="text-sm underline">
            Clear filter
          </Link>
        </p>
      )}
    </aside>
  );
}
