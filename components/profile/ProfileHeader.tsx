/**
 * Shared "identity" block for both `/me` and `/profiles/:username`.
 *
 * Bio is wrapped in `<section aria-label="Bio">` so free-form user text
 * gets announced with context by screen readers and is queryable by
 * accessible name in tests (see e2e/support/pom/public-profile.page.ts).
 */
export function ProfileHeader({
  name,
  username,
  bio,
}: {
  name: string | null;
  username: string | null;
  bio: string | null;
}) {
  return (
    <header>
      <h1 className="font-serif text-3xl font-bold">
        {name ?? username ?? "Anonymous"}
      </h1>
      {username && <p className="text-neutral-500">@{username}</p>}
      {bio && (
        <section aria-label="Bio" className="mt-4 text-neutral-700">
          {bio}
        </section>
      )}
    </header>
  );
}
