/**
 * Site-wide header. Auth-state indicator: signed-out shows Log in / Sign up
 * links; signed-in shows an account menu whose accessible name is "Account"
 * and which contains a "Log out" menuitem.
 *
 * `role="banner"` is provided implicitly by <header>. See docs/CODING_STANDARDS.md
 * §Accessibility.
 */
import Link from "next/link";
import { auth } from "@/lib/auth/config";
import { AccountMenu } from "./AccountMenu";

export async function Header() {
  const session = await auth();

  return (
    <header className="flex items-center justify-between border-b px-6 py-3">
      <Link href="/" className="font-serif text-xl font-bold">
        Medium-Alt
      </Link>
      <nav className="flex items-center gap-3">
        {session?.user ? (
          <AccountMenu userLabel={session.user.name ?? session.user.email ?? "Account"} />
        ) : (
          <>
            <Link href="/login" className="text-sm">
              Log in
            </Link>
            <Link
              href="/register"
              className="rounded-md bg-black px-3 py-1.5 text-sm text-white"
            >
              Sign up
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
