import Link from "next/link";

/**
 * `<FeedTabs>` — Your Feed / Global tab pair on `/`.
 *
 * Only rendered when the viewer is authenticated (parent page decides;
 * see `app/page.tsx`). Anonymous visitors see the global feed as
 * before with no tabs — the tab bar is meaningless without a session
 * to key "Your" off.
 *
 * Semantically a `<nav>` with two `<Link>`s, not an ARIA tablist.
 * Real tabs have panels; these are navigation between two URLs, and
 * `getByRole('link', { name: 'Your Feed' })` is the natural locator
 * for tests.
 */
export function FeedTabs({ active }: { active: "you" | "global" }) {
  return (
    <nav aria-label="Feed" className="mb-6 flex gap-6 border-b border-neutral-200">
      <TabLink href="/?feed=me" label="Your Feed" isActive={active === "you"} />
      <TabLink href="/" label="Global" isActive={active === "global"} />
    </nav>
  );
}

function TabLink({
  href,
  label,
  isActive,
}: {
  href: string;
  label: string;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={
        "pb-2 text-sm " +
        (isActive
          ? "border-b-2 border-neutral-900 font-medium text-neutral-900"
          : "text-neutral-600 hover:text-neutral-900")
      }
    >
      {label}
    </Link>
  );
}
