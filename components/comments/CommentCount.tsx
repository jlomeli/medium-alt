/**
 * Pure-display comment count. Shared by `<ArticleCard>` (feed
 * surface) and `<CommentsSection>` (read-page heading) so the
 * "how do we render zero?" convention lives in one file.
 *
 * Mirrors `<ClapCount>` in DOM shape:
 *
 *   <span class="…">
 *     <span aria-hidden="true">💬</span>
 *     <span aria-label="<contextLabel>">3</span>
 *   </span>
 *
 * The count is a sibling with an accessible name so
 * `getByLabel("Comment count").toHaveText("3")` matches the digit
 * alone.
 */
export function CommentCount({
  count,
  label = "Comment count",
  className,
}: {
  count: number;
  label?: string;
  className?: string;
}) {
  return (
    <span
      className={
        className ?? "inline-flex items-center gap-1 text-sm text-neutral-600"
      }
    >
      <span aria-hidden="true">💬</span>
      <span aria-label={label}>{count}</span>
    </span>
  );
}
