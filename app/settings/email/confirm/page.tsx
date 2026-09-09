import { ConfirmEmailChangeForm } from "./confirm-form";

/**
 * `/settings/email/confirm?token=…`.
 *
 * Same shape as `/password-reset/confirm`: server component just reads
 * the token off the URL and hands off to the client form for the POST.
 *
 * Unlike password-reset, this endpoint has no "new password" input —
 * the token is the only submission. We still render a click-through
 * form so link previews / prefetchers can't auto-consume the token
 * (the swap happens on button POST, not on page load).
 *
 * See docs/specs/account-security.md § UI surface + § Delivery ordering.
 */
export default async function ConfirmEmailChangePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6">
        <h1 className="mb-4 font-serif text-3xl font-bold tracking-tight">
          Confirm email change
        </h1>
        <p role="alert" className="text-sm text-red-600">
          This link is no longer valid or has expired. Request a new verification
          from your settings.
        </p>
      </main>
    );
  }

  return <ConfirmEmailChangeForm token={token} />;
}
