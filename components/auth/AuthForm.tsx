"use client";

import { cn } from "@/lib/utils";

/**
 * Shared shell for /login, /register, /password-reset/*. Renders:
 *   - <h1>{heading}</h1>
 *   - <form> (native, so tests can `getByRole('form', { name })`)
 *   - a single `role="alert"` region that consumers use for top-level errors
 *
 * Field-level errors are also rendered as `role="alert"` next to their input
 * so tests can query them by text without needing to know a specific id.
 */
export function AuthForm({
  heading,
  onSubmit,
  submitLabel,
  error,
  children,
  className,
}: {
  heading: string;
  submitLabel: string;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
  error?: string | null;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center p-6">
      <h1 className="mb-6 font-serif text-3xl font-bold tracking-tight">{heading}</h1>
      <form
        aria-label={heading}
        onSubmit={onSubmit}
        className={cn("flex flex-col gap-4", className)}
        noValidate
      >
        {children}
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button
          type="submit"
          className="mt-2 rounded-md bg-black px-4 py-2 text-white hover:bg-neutral-800"
        >
          {submitLabel}
        </button>
      </form>
    </main>
  );
}

export function FieldError({ id, message }: { id: string; message?: string | null }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className="mt-1 text-sm text-red-600">
      {message}
    </p>
  );
}
