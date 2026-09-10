/**
 * Empty state for `/profiles/[username]/followers|following` when
 * the target user has zero rows on that side. Copy varies by `kind`
 * per docs/specs/follow-lists.md § Acceptance criteria.
 *
 * Rendered inside a `<section aria-label="Empty state">` so tests
 * can match on the accessible region name without pinning the copy
 * exact-string.
 */
export function UserListEmptyState({
  kind,
  username,
}: {
  kind: "followers" | "following";
  username: string;
}) {
  const copy =
    kind === "followers"
      ? `@${username} doesn't have any followers yet.`
      : `@${username} isn't following anyone yet.`;
  return (
    <section
      aria-label="Empty state"
      className="rounded-md border border-dashed p-6 text-center text-neutral-600"
    >
      <p>{copy}</p>
    </section>
  );
}
