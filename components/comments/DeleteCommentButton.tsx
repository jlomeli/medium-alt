"use client";

/**
 * `<DeleteCommentButton>` — client component for the "delete my own
 * comment" affordance on `/articles/[slug]`.
 *
 * Same-origin `fetch(DELETE)` → `router.refresh()` on 204 (the RSC
 * re-renders the list without the row). On failure surfaces a
 * `role="alert"` sibling; the button stays enabled so a retry is one
 * click away.
 *
 * Accessible name: `"Delete your comment posted <relative time>"` —
 * see docs/specs/comments.md § UI surface. The relative time is
 * rendered off the exact ISO timestamp the RSC passes in so the label
 * stays stable across re-renders (a `Date.now()` in here would drift
 * every second and thrash accessibility announcements).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

/**
 * Cheap relative-time formatter. Rounds down to the coarsest unit
 * that fits so "just now" beats "0 seconds ago". Kept local because
 * the delete button is the only affordance that needs it — a shared
 * util can land when a second caller shows up.
 */
function relativeTimeFrom(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function DeleteCommentButton({
  slug,
  commentId,
  postedAt,
}: {
  slug: string;
  commentId: string;
  /** ISO string from the RSC — kept stable per render. */
  postedAt: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const relative = relativeTimeFrom(postedAt);
  const label = `Delete your comment posted ${relative}`;

  async function onClick() {
    setError(null);
    let res: Response;
    try {
      res = await fetch(
        `/api/articles/${encodeURIComponent(slug)}/comments/${encodeURIComponent(
          commentId,
        )}`,
        { method: "DELETE" },
      );
    } catch (err) {
      console.warn("[DeleteCommentButton] DELETE failed", err);
      setError("Couldn't delete this comment — please try again.");
      return;
    }
    if (res.status !== 204) {
      setError("Couldn't delete this comment — please try again.");
      return;
    }
    // Refresh the current RSC tree so the deleted row disappears from
    // the list AND the section heading count decrements — both are
    // rendered on the server and would otherwise still show the
    // stale comment until a manual reload.
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        aria-label={label}
        className={
          "text-xs " +
          (isPending
            ? "cursor-not-allowed text-neutral-400"
            : "text-red-700 hover:underline")
        }
      >
        Delete
      </button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {error}
        </p>
      )}
    </>
  );
}
