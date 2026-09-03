"use client";

/**
 * `<PostCommentSubmit>` — the submit button for `<CommentForm>`.
 *
 * Split out of `<CommentForm>` on purpose: `useFormStatus` is only
 * available to components rendered as descendants of the `<form>`,
 * so a component that itself renders the `<form>` reads the default
 * `{ pending: false }` and never disables its own button — a
 * double-click posts twice. This nested child sits inside the form
 * that `<CommentForm>` renders, so the hook resolves against the
 * correct pending state.
 *
 * Same parent-owns-form / child-owns-`useFormStatus` split React 19
 * requires for every submit-button-with-spinner pattern.
 */
import { useFormStatus } from "react-dom";

export function PostCommentSubmit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={
        "inline-flex items-center rounded-md border px-3 py-1.5 text-sm " +
        (pending
          ? "cursor-not-allowed border-neutral-300 bg-neutral-100 text-neutral-500"
          : "hover:bg-neutral-50")
      }
    >
      {pending ? "Posting…" : "Post comment"}
    </button>
  );
}
