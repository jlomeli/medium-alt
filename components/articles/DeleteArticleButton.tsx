"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface Props {
  slug: string;
  title: string;
}

/**
 * Confirm-and-delete flow for the edit page. The sole delete surface —
 * `ArticleForm` no longer owns a delete path (see
 * `docs/specs/articles-delete-ui.md` § UI surface).
 *
 * State machine, one variant per response the DELETE can produce:
 *
 *   idle          — dialog closed
 *   confirm       — dialog open, waiting for the user
 *   session-expired (401) — dialog swaps to "sign in again" + callbackUrl link
 *   already-removed (404) — dialog swaps to "already removed" + OK → /me/articles
 *   error         (5xx / network) — dialog surfaces retry copy, Delete re-enables
 *
 * Pending-state contract (spec § UI surface):
 *
 * - `startTransition`'s callback is `async` and **awaits** the fetch, so
 *   `isPending` stays true for the full request lifetime.
 * - The dialog's `Delete` button and the outer trigger both bind
 *   `disabled={isPending}`; the button label swaps to `Deleting…` while
 *   pending. `performDelete` also short-circuits on `isPending` — a
 *   defense-in-depth guard in case a stray click ever slips past the
 *   disabled state.
 * - `onDismiss` (Escape / backdrop) is a no-op while pending, so the
 *   user cannot close the dialog mid-request.
 */
export function DeleteArticleButton({ slug, title }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const headingId = useId();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<
    "confirm" | "session-expired" | "already-removed" | "error"
  >("confirm");
  const [isPending, startTransition] = useTransition();

  function openDialog() {
    setState("confirm");
    setOpen(true);
  }

  function closeDialog() {
    if (isPending) return;
    setOpen(false);
  }

  function performDelete() {
    if (isPending) return;
    startTransition(async () => {
      try {
        const res = await fetch(`/api/articles/${slug}`, { method: "DELETE" });
        if (res.status === 204) {
          setOpen(false);
          router.push("/me/articles");
          router.refresh();
          return;
        }
        if (res.status === 401) {
          setState("session-expired");
          return;
        }
        if (res.status === 404) {
          setState("already-removed");
          return;
        }
        setState("error");
      } catch {
        setState("error");
      }
    });
  }

  const heading =
    state === "already-removed"
      ? "Article already removed"
      : state === "session-expired"
        ? "Sign in to continue"
        : `Delete "${title}"?`;

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        disabled={isPending}
        className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Delete article
      </button>
      <ConfirmDialog open={open} labelledBy={headingId} onDismiss={closeDialog}>
        <h2 id={headingId} className="mb-2 text-lg font-semibold">
          {heading}
        </h2>

        {state === "confirm" && (
          <>
            <p className="mb-4 text-sm text-neutral-700">
              This will also delete the cover image and any inline images
              uploaded to this article.
            </p>
            <div className="flex justify-end gap-2">
              {/* Cancel is first in DOM order so ConfirmDialog's initial-focus
                  contract lands here — a stray Enter cannot fire Delete. */}
              <button
                type="button"
                onClick={closeDialog}
                className="rounded-md border px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={performDelete}
                disabled={isPending}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </>
        )}

        {state === "session-expired" && (
          <>
            <p className="mb-4 text-sm text-neutral-700">
              Please sign in again to delete this article.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeDialog}
                className="rounded-md border px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
              <Link
                href={`/login?callbackUrl=${encodeURIComponent(pathname)}`}
                className="rounded-md bg-black px-3 py-1.5 text-sm text-white"
              >
                Sign in
              </Link>
            </div>
          </>
        )}

        {state === "already-removed" && (
          <>
            <p className="mb-4 text-sm text-neutral-700">
              This article has already been removed.
            </p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push("/me/articles");
                }}
                className="rounded-md bg-black px-3 py-1.5 text-sm text-white"
              >
                OK
              </button>
            </div>
          </>
        )}

        {state === "error" && (
          <>
            <p className="mb-4 text-sm text-neutral-700">
              Couldn&apos;t delete this article. Please try again.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={closeDialog}
                className="rounded-md border px-3 py-1.5 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={performDelete}
                disabled={isPending}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </>
        )}
      </ConfirmDialog>
    </>
  );
}
