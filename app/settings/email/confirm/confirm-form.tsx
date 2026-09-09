"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * `/settings/email/confirm` — click-through confirmation UI.
 *
 * Three terminal states after POST /api/me/email/confirm:
 *   - 200 → "Email updated to <new>." + link to /me
 *   - 409 in-use → "That email is now in use by another account."
 *   - 400 (unknown, expired, reused, malformed) → "This link is no
 *     longer valid or has expired." Spec § Change email — confirm
 *     collapses all three of unknown/expired/reused to the same shape.
 */
type Status =
  | { kind: "idle" }
  | { kind: "success"; email: string }
  | { kind: "invalid" }
  | { kind: "in-use" }
  | { kind: "network" };

export function ConfirmEmailChangeForm({ token }: { token: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/me/email/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = (await res.json().catch(() => null)) as
        | { email?: string; error?: { field?: string; code?: string } }
        | null;

      if (res.status === 200 && body?.email) {
        setStatus({ kind: "success", email: body.email });
        // Refresh so /me picks up the new email if the user navigates.
        router.refresh();
        return;
      }
      if (res.status === 409 && body?.error?.code === "in-use") {
        setStatus({ kind: "in-use" });
        return;
      }
      // Everything else collapses to invalid — spec § Change email —
      // confirm merges unknown / expired / reused / malformed.
      setStatus({ kind: "invalid" });
    } catch {
      setStatus({ kind: "network" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6">
      <h1 className="mb-4 font-serif text-3xl font-bold tracking-tight">
        Confirm email change
      </h1>

      {status.kind === "idle" && (
        <form
          aria-label="Confirm email change"
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
        >
          <p className="text-sm text-neutral-700">
            Confirm you want to swap your Medium-Alt login email to the address
            this link was sent to.
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-black px-4 py-2 text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Confirm email change
          </button>
          {submitting && <p className="text-sm text-neutral-500">Confirming…</p>}
        </form>
      )}

      {status.kind === "success" && (
        <div>
          <p role="status" className="text-sm text-green-700">
            Email updated to {status.email}.
          </p>
          <p className="mt-4 text-sm">
            <Link href="/me" className="underline">
              Back to your profile
            </Link>
          </p>
        </div>
      )}

      {status.kind === "invalid" && (
        <p role="alert" className="text-sm text-red-600">
          This link is no longer valid or has expired. Request a new verification
          from your settings.
        </p>
      )}

      {status.kind === "in-use" && (
        <p role="alert" className="text-sm text-red-600">
          That email is now in use by another account.
        </p>
      )}

      {status.kind === "network" && (
        <p role="alert" className="text-sm text-red-600">
          Couldn&rsquo;t reach the server. Please try again.
        </p>
      )}
    </main>
  );
}
