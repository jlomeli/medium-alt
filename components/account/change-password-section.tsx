"use client";

import { useState } from "react";
import { changePasswordSchema } from "@/lib/validation/account";

/**
 * `/me/edit` § Change password.
 *
 * Owns its own submit state / success indicator — never shares state
 * with the profile form or the email-change section. See
 * docs/specs/account-security.md § UI surface.
 *
 * The submit lock (`submitting`) mirrors the same "release only on
 * failure" pattern as `<EditProfileForm>`, but here we STAY on the
 * page after success (we're not navigating away), so we release the
 * lock explicitly once the success indicator is rendered.
 */
interface FieldErrors {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}

export function ChangePasswordSection() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [topLevelError, setTopLevelError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setErrors({});
    setTopLevelError(null);
    setSuccess(false);

    // Client-side confirm-match check — the server never sees
    // `confirmPassword` (it's not in `changePasswordSchema`), so a
    // mismatch is a purely client-side error.
    if (newPassword !== confirmPassword) {
      setErrors({ confirmPassword: "Passwords don't match." });
      return;
    }

    const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword });
    if (!parsed.success) {
      const first = parsed.error.issues[0]!;
      const field = String(first.path[0]) as keyof FieldErrors;
      setErrors({ [field]: first.message });
      return;
    }

    // Same-as-current — surfaced client-side too so the user doesn't
    // pay a round-trip for a trivial mistake. Server enforces it
    // regardless (see route.ts).
    if (currentPassword === newPassword) {
      setErrors({ newPassword: "New password must differ from your current password." });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/me/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { error?: { field?: string; code?: string; message?: string } }
          | null;
        const err = body?.error;
        if (err?.field === "currentPassword" && err.code === "invalid") {
          setErrors({ currentPassword: "That password is incorrect." });
        } else if (err?.field === "newPassword" && err.code === "same-as-current") {
          setErrors({
            newPassword: "New password must differ from your current password.",
          });
        } else if (err?.field === "newPassword") {
          setErrors({ newPassword: err.message ?? "New password is invalid." });
        } else {
          setTopLevelError("Something went wrong. Please try again.");
        }
        return;
      }

      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch {
      setTopLevelError("Couldn't reach the server. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="change-password-heading" className="mt-10">
      <h2
        id="change-password-heading"
        className="mb-4 font-serif text-2xl font-semibold"
      >
        Change password
      </h2>
      <form
        aria-label="Change password"
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
        noValidate
      >
        <div>
          <label className="mb-1 block text-sm" htmlFor="currentPassword">
            Current password
          </label>
          <input
            id="currentPassword"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full rounded-md border px-3 py-2"
            autoComplete="current-password"
          />
          {errors.currentPassword && (
            <p role="alert" className="mt-1 text-sm text-red-600">
              {errors.currentPassword}
            </p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm" htmlFor="newPassword">
            New password
          </label>
          <input
            id="newPassword"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full rounded-md border px-3 py-2"
            autoComplete="new-password"
          />
          {errors.newPassword && (
            <p role="alert" className="mt-1 text-sm text-red-600">
              {errors.newPassword}
            </p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm" htmlFor="confirmPassword">
            Confirm new password
          </label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="w-full rounded-md border px-3 py-2"
            autoComplete="new-password"
          />
          {errors.confirmPassword && (
            <p role="alert" className="mt-1 text-sm text-red-600">
              {errors.confirmPassword}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-black px-4 py-2 text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Change password
          </button>
          {submitting && <p className="text-sm text-neutral-500">Saving…</p>}
        </div>
        {topLevelError && (
          <p role="alert" className="text-sm text-red-600">
            {topLevelError}
          </p>
        )}
        {success && (
          <p role="status" className="text-sm text-green-700">
            Password changed.
          </p>
        )}
      </form>
    </section>
  );
}
