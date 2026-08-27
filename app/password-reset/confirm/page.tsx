import { db } from "@/lib/db";
import { hash as hashToken } from "@/lib/auth/reset-token";
import { ConfirmForm } from "./confirm-form";

/**
 * `/password-reset/confirm?token=…`.
 *
 * Server component: validates the token on load so stale/reused/invalid links
 * render the error state without letting the user waste a submit. Valid tokens
 * hand off to the client `<ConfirmForm>` for the actual set-new-password
 * interaction.
 *
 * Even after the on-load check passes, the confirm API re-validates on
 * submit — a token could expire between page load and submit.
 */
export default async function PasswordResetConfirmPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return <ErrorState message="This reset link is invalid. Request a new one." />;
  }

  const row = await db.passwordResetToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { expiresAt: true, usedAt: true },
  });

  if (!row || row.usedAt) {
    return <ErrorState message="This reset link is invalid. Request a new one." />;
  }
  if (row.expiresAt < new Date()) {
    return <ErrorState message="This reset link has expired. Request a new one." />;
  }

  return <ConfirmForm token={token} />;
}

function ErrorState({ message }: { message: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6">
      <h1 className="mb-4 font-serif text-3xl font-bold tracking-tight">Reset password</h1>
      <p role="alert" className="text-sm text-red-600">
        {message}
      </p>
    </main>
  );
}
