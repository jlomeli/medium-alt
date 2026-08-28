"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { AuthForm } from "@/components/auth/AuthForm";
import { safeCallbackUrl } from "@/lib/auth/callback-url";

const GENERIC_ERROR = "Email or password is incorrect";

export function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const callbackUrl = safeCallbackUrl(search.get("callbackUrl"));

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (!res || res.error) {
      setError(GENERIC_ERROR);
      setSubmitting(false);
      return;
    }

    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <AuthForm
      heading="Log in to Medium-Alt"
      submitLabel="Log in"
      onSubmit={handleSubmit}
      error={error}
    >
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
      <div>
        <label className="mb-1 block text-sm" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border px-3 py-2"
          autoComplete="current-password"
        />
      </div>
      <div className="flex justify-between text-sm">
        <Link href="/password-reset/request">Forgot password?</Link>
        <Link href="/register">Sign up</Link>
      </div>
      {submitting && <p className="text-sm text-neutral-500">Signing in…</p>}
    </AuthForm>
  );
}
