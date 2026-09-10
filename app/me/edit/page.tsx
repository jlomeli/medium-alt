import { redirect } from "next/navigation";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db";
import { EditProfileForm } from "./edit-profile-form";
import { ChangePasswordSection } from "@/components/account/change-password-section";
import {
  ChangeEmailSection,
  type PendingEmailChangeView,
} from "@/components/account/change-email-section";

/**
 * `/me/edit` — profile edit + credentials management.
 *
 * The page composes three independent sections:
 *   - Edit profile (name / username / bio) — PATCH /api/me
 *   - Change password — POST /api/me/password
 *   - Change email — POST /api/me/email (+ /resend, /cancel)
 *
 * All server data is fetched here (email, pending email-change row) so
 * the client sections can render synchronously without their own
 * `useEffect`s. See docs/specs/account-security.md § UI surface.
 */
export default async function EditProfilePage() {
  const session = await auth();
  if (!session?.user) {
    redirect("/login?callbackUrl=%2Fme%2Fedit");
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      email: true,
      username: true,
      name: true,
      bio: true,
      pendingEmailChange: { select: { newEmail: true, createdAt: true } },
    },
  });
  if (!user) redirect("/login");

  const pending: PendingEmailChangeView | null = user.pendingEmailChange
    ? {
        newEmail: user.pendingEmailChange.newEmail,
        createdAt: user.pendingEmailChange.createdAt.toISOString(),
      }
    : null;

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-6 font-serif text-3xl font-bold">Edit profile</h1>
      <EditProfileForm
        initial={{
          username: user.username ?? "",
          name: user.name ?? "",
          bio: user.bio ?? "",
        }}
      />
      <ChangePasswordSection />
      <ChangeEmailSection currentEmail={user.email} pending={pending} />
    </main>
  );
}
