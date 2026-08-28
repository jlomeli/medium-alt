import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";

/**
 * `/me` — the first protected page. Used by the login callbackUrl tests and
 * the logout test. Server component: session check happens at request time,
 * unauthenticated visitors are redirected to /login preserving the intended
 * destination.
 */
export default async function MePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=%2Fme");
  }

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="mb-4 font-serif text-3xl font-bold">Your account</h1>
      <p className="text-neutral-600">
        Signed in as {session.user.email}.
      </p>
    </main>
  );
}
