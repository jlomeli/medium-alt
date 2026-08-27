"use client";

import { useState } from "react";
import { AuthForm } from "@/components/auth/AuthForm";

export default function PasswordResetRequestPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    await fetch("/api/password-reset/request", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
    });
    // Regardless of API outcome we always show the same generic confirmation
    // — this UI mirrors the anti-enumeration contract in the spec.
    setSent(true);
    setSubmitting(false);
  }

  if (sent) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6">
        <h1 className="mb-4 font-serif text-3xl font-bold tracking-tight">Check your email</h1>
        <p className="text-sm text-neutral-600">
          If an account matches that email, we&apos;ve sent a link to reset your password. The
          link expires in one hour.
        </p>
      </main>
    );
  }

  return (
    <AuthForm heading="Reset your password" submitLabel="Send reset link" onSubmit={handleSubmit}>
      <div>
        <label className="mb-1 block text-sm" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border px-3 py-2"
          autoComplete="email"
        />
      </div>
      {submitting && <p className="text-sm text-neutral-500">Sending…</p>}
    </AuthForm>
  );
}
