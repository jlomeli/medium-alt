import Link from "next/link";
import type { CommentWithAuthorship } from "@/lib/comments/service";
import { DeleteCommentButton } from "./DeleteCommentButton";

/**
 * One comment row on `/articles/[slug]`. Server component — receives
 * the internal `CommentWithAuthorship` (carrying `authorId`) and the
 * viewer's `session?.user.id`, gates `<DeleteCommentButton>` on the
 * stable-id compare.
 *
 * Ownership gate is deliberately a stable-id compare, not a username
 * string compare that a future rename slice could silently break by
 * stripping the delete affordance from the real owner.
 */
export function CommentItem({
  slug,
  comment,
  viewerId,
}: {
  slug: string;
  comment: CommentWithAuthorship;
  viewerId: string | null;
}) {
  const authorLabel =
    comment.author.name && comment.author.username
      ? `${comment.author.name} (@${comment.author.username})`
      : (comment.author.name ??
          comment.author.username ??
          "Anonymous");
  const isOwner = viewerId !== null && viewerId === comment.authorId;

  return (
    <li className="border-b border-neutral-200 py-4 last:border-b-0">
      <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-neutral-500">
        {comment.author.username ? (
          <Link
            href={`/profiles/${comment.author.username}`}
            className="font-medium text-neutral-800 hover:underline"
          >
            {authorLabel}
          </Link>
        ) : (
          <span className="font-medium text-neutral-800">{authorLabel}</span>
        )}
        <span aria-hidden="true">·</span>
        <time dateTime={comment.createdAt.toISOString()}>
          {comment.createdAt.toLocaleString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          })}
        </time>
      </p>
      <p className="mt-2 whitespace-pre-wrap text-neutral-900">
        {comment.body}
      </p>
      {isOwner && (
        <div className="mt-2">
          <DeleteCommentButton
            slug={slug}
            commentId={comment.id}
            postedAt={comment.createdAt.toISOString()}
          />
        </div>
      )}
    </li>
  );
}
