"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { updateMeSchema } from "@/lib/validation/profile";

interface FieldErrors {
  name?: string;
  username?: string;
  bio?: string;
}

export function EditProfileForm({
  initial,
}: {
  initial: { name: string; username: string; bio: string };
}) {
  const router = useRouter();
  const [name, setName] = useState(initial.name);
  const [username, setUsername] = useState(initial.username);
  const [bio, setBio] = useState(initial.bio);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [topLevelError, setTopLevelError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Guard against a double-click landing a second submit while the first
    // is in flight; the button also carries `disabled={submitting}` for
    // pointer/keyboard consistency.
    if (submitting) return;
    setErrors({});
    setTopLevelError(null);

    // Build a partial payload — only include fields that actually changed
    // from the initial values. Empty submit is rejected server-side (and
    // client-side by the schema below).
    const payload: Record<string, string> = {};
    if (name !== initial.name) payload.name = name;
    if (username !== initial.username) payload.username = username;
    if (bio !== initial.bio) payload.bio = bio;

    const parsed = updateMeSchema.safeParse(payload);
    if (!parsed.success) {
      const first = parsed.error.issues[0]!;
      const field = String(first.path[0]) as keyof FieldErrors;
      setErrors({ [field]: first.message });
      return;
    }

    setSubmitting(true);
    // Only release the submit lock on FAILURE. On success the caller
    // navigates away via `router.push("/me")`, but there's a window
    // between the router transition starting and this component unmounting.
    // Resetting `submitting` in that window re-enables the form and lets
    // a second click land a concurrent PATCH — a last-write-wins race
    // against the still-in-flight navigation. Holding the lock until
    // unmount closes the race.
    let hadFailure = false;
    try {
      const res = await fetch("/api/me", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(parsed.data),
      });

      if (!res.ok) {
        hadFailure = true;
        const body = (await res.json().catch(() => null)) as
          | { error?: { field?: string; code?: string; message?: string } }
          | null;
        const err = body?.error;
        if (err?.code === "username-taken") {
          setErrors({ username: "Username is taken" });
        } else if (err?.field) {
          setErrors({ [err.field as keyof FieldErrors]: err.message ?? "Invalid value" });
        } else {
          // Non-JSON body, unknown shape, or unmapped status — always surface
          // *something* rather than silently clearing "Saving…" and leaving
          // the user staring at an unchanged form.
          setTopLevelError("Something went wrong. Please try again.");
        }
        return;
      }

      router.push("/me");
      router.refresh();
    } catch {
      // Network failure or a fetch rejection — same treatment as an
      // unmapped error above.
      hadFailure = true;
      setTopLevelError("Couldn't reach the server. Please try again.");
    } finally {
      if (hadFailure) setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-6 font-serif text-3xl font-bold">Edit profile</h1>
      <form
        aria-label="Edit profile"
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
        noValidate
      >
        <div>
          <label className="mb-1 block text-sm" htmlFor="name">
            Name
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border px-3 py-2"
            autoComplete="name"
          />
          {errors.name && (
            <p id="name-error" role="alert" className="mt-1 text-sm text-red-600">
              {errors.name}
            </p>
          )}
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
          {errors.username && (
            <p id="username-error" role="alert" className="mt-1 text-sm text-red-600">
              {errors.username}
            </p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm" htmlFor="bio">
            Bio
          </label>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="w-full rounded-md border px-3 py-2"
            rows={4}
          />
          {errors.bio && (
            <p id="bio-error" role="alert" className="mt-1 text-sm text-red-600">
              {errors.bio}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="rounded-md bg-black px-4 py-2 text-white hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Save changes
          </button>
          <Link href="/me" className="text-sm">
            Cancel
          </Link>
        </div>
        {topLevelError && (
          <p role="alert" className="text-sm text-red-600">
            {topLevelError}
          </p>
        )}
        {submitting && <p className="text-sm text-neutral-500">Saving…</p>}
      </form>
    </main>
  );
}
