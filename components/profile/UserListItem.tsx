import Link from "next/link";
import type { PublicUserSummary } from "@/lib/follows/service";
import { FollowButton } from "./FollowButton";

/**
 * One row on `/profiles/[username]/followers|following`. Renders the
 * display name (linked to the user's profile), the @-handle, an
 * optional bio excerpt, and one of three follow affordances:
 *
 *   - Self row (`user.isSelf`) — no affordance. Following yourself
 *     is meaningless and the profile page follows the same rule.
 *   - Signed-in on someone else — reuses `<FollowButton>` verbatim,
 *     seeded with the server-computed `viewerFollows` flag.
 *   - Anonymous viewer (both viewer fields absent) — a `Follow` link
 *     bouncing through `/login?callbackUrl=…`. Same accessible name
 *     as the button so tests can match on role-agnostic name.
 *
 * See docs/specs/follow-lists.md § UI surface. No `data-testid`; every
 * affordance is `getByRole`-reachable.
 */
export function UserListItem({ user }: { user: PublicUserSummary }) {
  const isAnonymous = user.viewerFollows === undefined;
  const profileHref = `/profiles/${user.username}`;

  return (
    <li className="flex items-start justify-between gap-4 py-3">
      <div className="min-w-0 flex-1">
        <Link href={profileHref} className="font-medium hover:underline">
          {user.name ?? `@${user.username}`}
        </Link>
        <p className="text-sm text-neutral-600">@{user.username}</p>
        {user.bioExcerpt && (
          <p className="mt-1 text-sm text-neutral-700">{user.bioExcerpt}</p>
        )}
      </div>
      <div className="shrink-0">
        {user.isSelf ? null : isAnonymous ? (
          <Link
            href={`/login?callbackUrl=${encodeURIComponent(profileHref)}`}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-50"
          >
            Follow
          </Link>
        ) : (
          <FollowButton
            username={user.username}
            initialFollowing={user.viewerFollows ?? false}
          />
        )}
      </div>
    </li>
  );
}
