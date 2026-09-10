import Link from "next/link";

/**
 * `<FollowCountsRow>` — two links rendered under the profile header.
 * See docs/specs/follow-lists.md § UI surface.
 *
 * Counts are DB-derived per render; this component is a pure
 * renderer. Both halves are always links, including at zero — the
 * empty-state UX lives on the list page, not the profile.
 *
 * Accessible name discipline: each link's accessible name includes
 * the count AND the noun, so a test using
 * `getByRole('link', { name: /(\d+) followers/ })` finds it
 * unambiguously. The `<strong>` inside is a visual affordance, not a
 * name segmentation.
 */
export function FollowCountsRow({
  username,
  followerCount,
  followingCount,
}: {
  username: string;
  followerCount: number;
  followingCount: number;
}) {
  return (
    <p className="mt-2 flex items-center gap-2 text-sm text-neutral-700">
      <Link
        href={`/profiles/${username}/followers`}
        className="hover:underline"
      >
        <strong>{followerCount}</strong> followers
      </Link>
      <span aria-hidden="true">·</span>
      <Link
        href={`/profiles/${username}/following`}
        className="hover:underline"
      >
        <strong>{followingCount}</strong> following
      </Link>
    </p>
  );
}
