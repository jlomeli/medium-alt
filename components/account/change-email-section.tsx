"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { changeEmailSchema } from "@/lib/validation/account";

/**
 * `/me/edit` § Change email.
 *
 * Two visible layouts:
 *   - No pending change → just the input form.
 *   - Pending change → banner (Resend / Cancel) AND the input form,
 *     stacked. Submitting a different address REPLACES the pending row
 *     via the server's "one pending change per user" invariant, so the
 *     user doesn't have to Cancel first for a mistyped-address retry.
 *     See docs/specs/account-security.md § UI surface + § Change email
 *     — pending state.
 *
 * All fetches call the same handlers (`/api/me/email`, `/resend`,
 * `/cancel`) and refresh the router on success so the server component
 * upstream re-reads the pending row.
 */
export interface PendingEmailChangeView {
  newEmail: string;
  /** ISO string — surfaced as-is; the section renders a relative label. */
  createdAt: string;
}

interface FieldErrors {
  newEmail?: string;
}

interface Props {
  currentEmail: string;
  pending: PendingEmailChangeView | null;
}

export function ChangeEmailSection({ currentEmail, pending }: Props) {
  const router = useRouter();
  const [newEmail, setNewEmail] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [topLevelError, setTopLevelError] = useState<string | null>(null);
  const [successEmail, setSuccessEmail] = useState<string | null>(null);
  const [resentEmail, setResentEmail] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  function clearBanners() {
    setErrors({});
    setTopLevelError(null);
    setSuccessEmail(null);
    setResentEmail(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    clearBanners();

    const parsed = changeEmailSchema.safeParse({ newEmail });
    if (!parsed.success) {
      const first = parsed.error.issues[0]!;
      setErrors({ newEmail: first.message });
      return;
    }

    if (newEmail.toLowerCase() === currentEmail.toLowerCase()) {
      setErrors({ newEmail: "New email must differ from your current email." });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/me/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { field?: string; code?: string; message?: string } }
          | null;
        const err = body?.error;
        if (err?.field === "newEmail" && err.code === "same-as-current") {
          setErrors({
            newEmail: "New email must differ from your current email.",
          });
        } else if (err?.field === "newEmail") {
          setErrors({ newEmail: err.message ?? "Email is invalid." });
        } else {
          setTopLevelError("Something went wrong. Please try again.");
        }
        return;
      }
      // 202 pending — happy path or anti-enumeration branch, indistinguishable.
      setSuccessEmail(newEmail);
      setNewEmail("");
      // Server component upstream re-reads the pending row to render the
      // banner (or replace an existing one).
      router.refresh();
    } catch {
      setTopLevelError("Couldn't reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResend() {
    if (resending || !pending) return;
    clearBanners();
    setResending(true);
    try {
      const res = await fetch("/api/me/email/resend", { method: "POST" });
      if (!res.ok) {
        setTopLevelError("Couldn't resend right now. Please try again.");
        return;
      }
      setResentEmail(pending.newEmail);
      router.refresh();
    } catch {
      setTopLevelError("Couldn't reach the server. Please try again.");
    } finally {
      setResending(false);
    }
  }

  async function handleCancel() {
    if (cancelling) return;
    clearBanners();
    setCancelling(true);
    try {
      const res = await fetch("/api/me/email/cancel", { method: "POST" });
      if (!res.ok) {
        setTopLevelError("Couldn't cancel right now. Please try again.");
        return;
      }
      router.refresh();
    } catch {
      setTopLevelError("Couldn't reach the server. Please try again.");
    } finally {
      setCancelling(false);
    }
  }

  return (
    <section aria-labelledby="change-email-heading" className="mt-10">
      <h2
        id="change-email-heading"
        className="mb-4 font-serif text-2xl font-semibold"
      >
        Change email
      </h2>

      <div className="mb-4 text-sm text-neutral-700">
        Current email: <span className="font-mono">{currentEmail}</span>
      </div>

      {pending && (
        <div
          role="status"
          className="mb-6 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm"
        >
          <p>
            Pending: <span className="font-mono">{pending.newEmail}</span> —
            verification sent.
          </p>
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="rounded-md border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Resend verification
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancelling}
              className="rounded-md border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Cancel change
            </button>
          </div>
        </div>
      )}

      <form
        aria-label="Change email"
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
        noValidate
      >
        <div>
          <label className="mb-1 block text-sm" htmlFor="newEmail">
            New email
          </label>
          <input
            id="newEmail"
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            className="w-full rounded-md border px-3 py-2"
            autoComplete="email"
          />
          {errors.newEmail && (
            <p role="alert" className="mt-1 text-sm text-red-600">
              {errors.newEmail}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-black px-4 py-2 text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send verification
          </button>
          {submitting && <p className="text-sm text-neutral-500">Sending…</p>}
        </div>
        {topLevelError && (
          <p role="alert" className="text-sm text-red-600">
            {topLevelError}
          </p>
        )}
        {successEmail && (
          <p role="status" className="text-sm text-green-700">
            Verification sent to {successEmail}.
          </p>
        )}
        {resentEmail && (
          <p role="status" className="text-sm text-green-700">
            Verification resent to {resentEmail}.
          </p>
        )}
      </form>
    </section>
  );
}
