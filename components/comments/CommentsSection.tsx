import { auth } from "@/lib/auth/config";
import { listCommentsForArticle } from "@/lib/comments/service";
import { CommentList } from "./CommentList";
import { CommentForm } from "./CommentForm";
import { SignInToComment } from "./SignInToComment";

/**
 * `<CommentsSection>` — server component. The orchestration shell
 * for the comment thread on `/articles/[slug]`:
 *   - reads the comment list (a single indexed `findMany`);
 *   - reads the session so the form-vs-link fork is a compile-time
 *     property of the parent, not a runtime branch inside a client
 *     component;
 *   - emits a `<section aria-labelledby="comments-heading">` with
 *     an `<h2 id="comments-heading">Comments (N)</h2>` so tests can
 *     scope by `getByRole("region", { name: /^Comments/ })` and
 *     assert the count without a testid;
 *   - renders `<CommentForm>` for signed-in viewers or a plain
 *     `<Link>`-based `<SignInToComment>` prompt for anonymous ones
 *     (same anonymous-shape convention as `<ClapButton>` and
 *     `<FollowButton>` from slices 6 and 7).
 *
 * Draft privacy: the caller (`/articles/[slug]/page.tsx`) gates
 * mounting this whole component on `article.published`. This keeps
 * the "no comment section on drafts, even own" rule at the
 * mount site, not scattered across the section body.
 */
export async function CommentsSection({
  slug,
  articleId,
}: {
  slug: string;
  articleId: string;
}) {
  const [session, comments] = await Promise.all([
    auth(),
    listCommentsForArticle(articleId),
  ]);
  const viewerId = session?.user?.id ?? null;

  return (
    <section
      aria-labelledby="comments-heading"
      className="mt-10"
    >
      <h2
        id="comments-heading"
        className="font-serif text-2xl font-bold"
      >
        {`Comments (${comments.length})`}
      </h2>
      <div className="mt-4">
        <CommentList slug={slug} comments={comments} viewerId={viewerId} />
      </div>
      {viewerId ? (
        <CommentForm slug={slug} />
      ) : (
        <SignInToComment slug={slug} />
      )}
    </section>
  );
}
