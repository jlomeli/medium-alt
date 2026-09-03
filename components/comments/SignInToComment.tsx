import Link from "next/link";

/**
 * Anonymous fallback rendered in place of `<CommentForm>` — mirrors
 * `<FollowButton variant="anonymous">` and `<ClapButton
 * variant="anonymous">` (slices 6 and 7): no client JS ships to
 * anonymous viewers, just a `<Link>` that bounces through /login with
 * a `callbackUrl` back to the article they were reading.
 */
export function SignInToComment({ slug }: { slug: string }) {
  const href = `/login?callbackUrl=${encodeURIComponent(`/articles/${slug}`)}`;
  return (
    <p className="mt-4">
      <Link href={href} className="text-sm text-neutral-700 hover:underline">
        Sign in or sign up to leave a comment.
      </Link>
    </p>
  );
}
