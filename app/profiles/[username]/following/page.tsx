import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { UserListItem } from "@/components/profile/UserListItem";
import { UserListEmptyState } from "@/components/profile/UserListEmptyState";
import { listFollowing } from "@/lib/follows/service";
import {
  DEFAULT_FOLLOW_LIST_LIMIT,
  decodeFollowListCursor,
} from "@/lib/validation/follow-lists";

/**
 * `/profiles/[username]/following` — list of accounts the given user
 * follows. Mirror of `/followers` — see docs/specs/follow-lists.md §
 * Following list.
 */
export default async function FollowingPage({
  params,
  searchParams,
}: {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ cursor?: string }>;
}) {
  const { username } = await params;
  const { cursor: rawCursor } = await searchParams;

  const session = await auth();

  let cursor;
  if (rawCursor) {
    try {
      cursor = decodeFollowListCursor(rawCursor);
    } catch {
      cursor = undefined;
    }
  }

  const result = await listFollowing(username, {
    limit: DEFAULT_FOLLOW_LIST_LIMIT,
    cursor,
    viewerId: session?.user?.id,
  });
  if (result === null) notFound();

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="font-serif text-2xl font-bold">
        People @{username} follows
      </h1>

      {result.items.length === 0 ? (
        <div className="mt-6">
          <UserListEmptyState kind="following" username={username} />
        </div>
      ) : (
        <>
          <ul className="mt-4 divide-y">
            {result.items.map((u) => (
              <UserListItem key={u.username} user={u} />
            ))}
          </ul>
          {result.nextCursor && (
            <nav aria-label="Pagination" className="mt-4 flex justify-end">
              <Link
                href={`/profiles/${username}/following?cursor=${encodeURIComponent(result.nextCursor)}`}
                className="rounded-md border px-3 py-1.5 text-sm hover:bg-neutral-50"
              >
                Next
              </Link>
            </nav>
          )}
        </>
      )}
    </main>
  );
}
