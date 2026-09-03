import type { CommentWithAuthorship } from "@/lib/comments/service";
import { CommentItem } from "./CommentItem";

/**
 * Pure map of `<CommentItem>` cards. Split out of
 * `<CommentsSection>` so the item mapping is testable in isolation
 * and so a future "load more" story can wrap this without touching
 * the section shell.
 *
 * Renders an explicit empty-state paragraph rather than an empty
 * `<ul>` so screen-reader users hear something meaningful when the
 * thread is empty.
 */
export function CommentList({
  slug,
  comments,
  viewerId,
}: {
  slug: string;
  comments: readonly CommentWithAuthorship[];
  viewerId: string | null;
}) {
  if (comments.length === 0) {
    return (
      <p className="text-sm text-neutral-500">
        No comments yet — be the first to say something.
      </p>
    );
  }
  return (
    <ul className="flex flex-col">
      {comments.map((c) => (
        <CommentItem key={c.id} slug={slug} comment={c} viewerId={viewerId} />
      ))}
    </ul>
  );
}
