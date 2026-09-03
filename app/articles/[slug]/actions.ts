"use server";

/**
 * Server actions for `/articles/[slug]`. Currently exports only
 * `postComment` — see docs/specs/comments.md § UI surface /
 * `<CommentForm>` for the seven-step flow this action implements.
 *
 * Deliberately does NOT `fetch()` its own POST endpoint: an internal
 * HTTP call would need session-cookie forwarding and a deployment-safe
 * absolute URL (both Vercel-preview footguns). Instead it calls the
 * shared service the route handler also calls, so the UI path and the
 * API path can't drift on validation or draft rules.
 */
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { resolveArticleForCaller } from "@/lib/articles/access";
import {
  createComment,
  CommentTargetMissingError,
} from "@/lib/comments/service";
import { createCommentSchema } from "@/lib/validation/comment";

/**
 * Discriminated union the `<CommentForm>` client consumes via
 * `useActionState`. The `submittedAt` on success is the client's
 * `key` for the `<textarea>` remount (empties the field without an
 * imperative `ref.reset()`) and the trigger for the post-success
 * focus `useEffect`.
 */
export type PostCommentState =
  | { status: "idle" }
  | { status: "success"; submittedAt: number }
  | {
      status: "error";
      error: {
        field: "body" | "slug";
        code: "out-of-range" | "not-found" | "unauthenticated";
        message?: string;
      };
    };

export async function postComment(
  slug: string,
  _prevState: PostCommentState,
  formData: FormData,
): Promise<PostCommentState> {
  // 1. Session — the anonymous DOM doesn't render `<CommentForm>` in
  //    the first place, so this branch is belt-and-braces against a
  //    session that expired between page render and submit.
  const session = await auth();
  if (!session?.user) {
    return {
      status: "error",
      error: {
        field: "body",
        code: "unauthenticated",
        message: "Please sign in to comment.",
      },
    };
  }

  // 2. Zod-validate the body. `formData.get` can return a File; the
  //    schema will reject non-strings.
  const raw = formData.get("body");
  const parsed = createCommentSchema.safeParse({ body: raw });
  if (!parsed.success) {
    const first = parsed.error.issues[0]!;
    return {
      status: "error",
      error: { field: "body", code: "out-of-range", message: first.message },
    };
  }

  // 3. Resolve the article — unknown slug OR draft not owned by the
  //    caller → 404. `resolveArticleForCaller` still returns an owned
  //    draft (that's what makes the edit-my-draft path work); the
  //    step-4 check rejects it.
  const article = await resolveArticleForCaller(slug, session.user.id);
  if (!article) {
    return {
      status: "error",
      error: {
        field: "slug",
        code: "not-found",
        message: "This article is unavailable.",
      },
    };
  }

  // 4. Reject a draft even when the caller owns it — an unpublished
  //    article has no reader audience for a comment. The POST route
  //    handler applies the same check against the same helper so the
  //    two write paths cannot drift.
  if (!article.published) {
    return {
      status: "error",
      error: {
        field: "slug",
        code: "not-found",
        message: "This article is unavailable.",
      },
    };
  }

  // 5. Persist. `CommentTargetMissingError` covers the race where the
  //    article was cascade-deleted between the resolve and the insert
  //    (matches the ClapTargetMissingError handling in the claps
  //    route).
  try {
    await createComment(session.user.id, article.id, parsed.data.body);
  } catch (err) {
    if (err instanceof CommentTargetMissingError) {
      return {
        status: "error",
        error: {
          field: "slug",
          code: "not-found",
          message: "This article is unavailable.",
        },
      };
    }
    throw err;
  }

  // 6. Nudge the RSC so the freshly-inserted row shows up in the list
  //    without a manual reload.
  revalidatePath(`/articles/${slug}`);

  // 7. Fresh timestamp — the client `key`s the `<textarea>` off this
  //    to remount (and clear) the field, and `useEffect`s off it to
  //    restore focus.
  return { status: "success", submittedAt: Date.now() };
}
