"use client";

/**
 * `<CommentForm>` — the signed-in reader's write path on
 * `/articles/[slug]`. See docs/specs/comments.md § UI surface.
 *
 * Uses React 19's `useActionState` to run the shared `postComment`
 * server action (also called by the POST route handler's shared
 * service — the UI path is action → service, not UI → HTTP → service,
 * so validation and draft rules can't drift).
 *
 * Field reset: keys the `<textarea>` off `state.submittedAt`. A fresh
 * key on success remounts the field to its empty default — no
 * imperative `ref.reset()` which would fight React's concurrent
 * render reordering. Focus is restored via a `useEffect` on the same
 * timestamp.
 *
 * `slug` is captured into the action closure at render time via
 * `postComment.bind(null, slug)`, so it can't be forged by a client
 * editing the DOM.
 */
import { useActionState, useEffect, useRef } from "react";
import { postComment, type PostCommentState } from "@/app/articles/[slug]/actions";
import { PostCommentSubmit } from "./PostCommentSubmit";

const initialState: PostCommentState = { status: "idle" };

export function CommentForm({ slug }: { slug: string }) {
  const boundAction = postComment.bind(null, slug);
  const [state, formAction] = useActionState(boundAction, initialState);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Post-success focus restoration. Keyed on `submittedAt` so a second
  // successful submit re-fires the effect even if the state shape is
  // otherwise identical.
  const submittedAt =
    state.status === "success" ? state.submittedAt : undefined;
  useEffect(() => {
    if (submittedAt !== undefined) {
      textareaRef.current?.focus();
    }
  }, [submittedAt]);

  const textareaKey =
    state.status === "success" ? String(state.submittedAt) : "draft";
  const errorMessage =
    state.status === "error" ? state.error.message : undefined;

  return (
    <form
      action={formAction}
      // Accessible name for the region + form scoping in the POM
      // (`getByRole("form", { name: "Post a comment" })`).
      aria-label="Post a comment"
      className="mt-4 flex flex-col gap-2"
    >
      <label htmlFor="comment-body" className="text-sm font-medium">
        Write a comment
      </label>
      <textarea
        // `key` remount is what clears the field on success — cheaper
        // and more predictable than an imperative `.value = ""` that
        // may race the next render.
        key={textareaKey}
        id="comment-body"
        name="body"
        ref={textareaRef}
        rows={3}
        // No `required` — server-side validation is authoritative and
        // returns a shaped error we render below; browser-native
        // "please fill out this field" would bypass that path and
        // produce inconsistent copy.
        className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
      />
      <div className="flex items-center gap-3">
        <PostCommentSubmit />
        {errorMessage && (
          <p role="alert" className="text-sm text-red-700">
            {errorMessage}
          </p>
        )}
      </div>
    </form>
  );
}
