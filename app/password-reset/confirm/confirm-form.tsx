"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { AuthForm, FieldError } from "@/components/auth/AuthForm";
import { passwordSchema } from "@/lib/validation/auth";

/**
 * `/password-reset/confirm?token=…`.
 *
 * The server enforces the real error taxonomy (expired / invalid / used).
 * We render whichever server error we got as the top-level `role="alert"`.
 */
export function ConfirmForm({ token }: { token: string }) {
  const router = useRouter();

  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [topLevelError, setTopLevelError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError(null);
    setTopLevelError(null);

    if (newPassword !== confirm) {
      setPasswordError("Passwords do not match");
      return;
    }
    const clientParsed = passwordSchema.safeParse(newPassword);
    if (!clientParsed.success) {
      setPasswordError(clientParsed.error.issues[0]!.message);
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/password-reset/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, newPassword }),
    });
    const body = (await res.json().catch(() => null)) as
      | { ok?: boolean; email?: string; error?: string }
      | null;

    if (!res.ok) {
      const code = body?.error;
      if (code === "weak-password") {
        setPasswordError("Password must be at least 8 characters and include upper/lower/digit");
      } else if (code === "expired") {
        setTopLevelError("This reset link has expired. Request a new one.");
      } else {
        setTopLevelError("This reset link is invalid. Request a new one.");
      }
      setSubmitting(false);
      return;
    }

    // Confirm endpoint returns the user's email on success (see spec §API
    // surface) so we can auto-sign-in via Credentials. Same email that
    // requested the reset — no info leak.
    if (body?.email) {
      await signIn("credentials", {
        email: body.email,
        password: newPassword,
        redirect: false,
      });
    }
    router.push("/");
    router.refresh();
  }

  if (topLevelError) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6">
        <h1 className="mb-4 font-serif text-3xl font-bold tracking-tight">Reset password</h1>
        <p role="alert" className="text-sm text-red-600">
          {topLevelError}
        </p>
      </main>
    );
  }

  return (
    <AuthForm heading="Set a new password" submitLabel="Update password" onSubmit={handleSubmit}>
      <div>
        <label className="mb-1 block text-sm" htmlFor="new-password">
          New password
        </label>
        <input
          id="new-password"
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="w-full rounded-md border px-3 py-2"
          autoComplete="new-password"
        />
        <FieldError id="password-error" message={passwordError} />
      </div>
      <div>
        <label className="mb-1 block text-sm" htmlFor="confirm-password">
          Confirm new password
        </label>
        <input
          id="confirm-password"
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="w-full rounded-md border px-3 py-2"
          autoComplete="new-password"
        />
      </div>
      {submitting && <p className="text-sm text-neutral-500">Updating…</p>}
    </AuthForm>
  );
}
