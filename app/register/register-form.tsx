"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { AuthForm, FieldError } from "@/components/auth/AuthForm";
import { registerSchema } from "@/lib/validation/auth";
import { safeCallbackUrl } from "@/lib/auth/callback-url";

interface FieldErrors {
  email?: string;
  username?: string;
  password?: string;
}

export function RegisterForm() {
  const router = useRouter();
  const search = useSearchParams();
  const callbackUrl = search.get("callbackUrl") ?? "/";

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});

    const clientParsed = registerSchema.safeParse({
      email,
      username,
      password,
      name: name || undefined,
    });
    if (!clientParsed.success) {
      const first = clientParsed.error.issues[0]!;
      const field = String(first.path[0]) as keyof FieldErrors;
      setErrors({ [field]: first.message });
      return;
    }

    setSubmitting(true);
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(clientParsed.data),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const err = body?.error;
      if (err?.field === "email" && err?.code === "email-taken") {
        setErrors({ email: "Email is already registered" });
      } else if (err?.field === "username" && err?.code === "username-taken") {
        setErrors({ username: "Username is taken" });
      } else if (err?.field) {
        setErrors({ [err.field as keyof FieldErrors]: err.message ?? "Invalid value" });
      }
      setSubmitting(false);
      return;
    }

    // Auto-login. `redirect: false` so we can pick a safe redirect ourselves.
    await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    router.push(safeCallbackUrl(callbackUrl));
    router.refresh();
  }

  return (
    <AuthForm heading="Create your account" submitLabel="Create account" onSubmit={handleSubmit}>
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
        <FieldError id="email-error" message={errors.email} />
      </div>
      <div>
        <label className="mb-1 block text-sm" htmlFor="username">
          Username
        </label>
        <input
          id="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full rounded-md border px-3 py-2"
          autoComplete="username"
        />
        <FieldError id="username-error" message={errors.username} />
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
          autoComplete="new-password"
        />
        <FieldError id="password-error" message={errors.password} />
      </div>
      <div>
        <label className="mb-1 block text-sm" htmlFor="name">
          Name (optional)
        </label>
        <input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border px-3 py-2"
          autoComplete="name"
        />
      </div>
      <p className="text-sm">
        Already have an account? <Link href="/login">Log in</Link>
      </p>
      {submitting && <p className="text-sm text-neutral-500">Creating account…</p>}
    </AuthForm>
  );
}

