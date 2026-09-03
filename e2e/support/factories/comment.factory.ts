import type { APIRequestContext } from "@playwright/test";

/**
 * Comment factory — see docs/specs/comments.md § E2E test plan.
 *
 * `.create()` and `.delete()`, no `.build()` — a comment detached
 * from an article is meaningless. Unlike `FollowFactory`, the create
 * is NOT idempotent: two POSTs with the same body produce two rows,
 * which is the correct app semantics. Tests that need "N comments
 * exist" call `.create()` N times explicitly.
 */
export type CreatedComment = {
  id: string;
  body: string;
  createdAt: string;
  author: {
    username: string | null;
    name: string | null;
    image: string | null;
  };
};

export class CommentFactory {
  /**
   * `commenterApi` MUST already carry the commenter's session cookie
   * — usually the `.request` off a `loggedInPage`'s context, or the
   * `.api` field returned by `createLoggedInApi` for a secondary
   * user. `slug` is the article being commented on. `body` is the
   * comment text; length is enforced by `CreateCommentInput` (1..1000
   * after trim). Returns the public `Comment` shape.
   */
  async create(
    commenterApi: APIRequestContext,
    slug: string,
    body: string,
  ): Promise<CreatedComment> {
    const res = await commenterApi.post(
      `/api/articles/${encodeURIComponent(slug)}/comments`,
      { data: { body } },
    );
    if (!res.ok()) {
      throw new Error(
        `CommentFactory.create() failed: POST /api/articles/${slug}/comments ${res.status()} — ${await res.text()}`,
      );
    }
    return (await res.json()) as CreatedComment;
  }

  async delete(
    commenterApi: APIRequestContext,
    slug: string,
    commentId: string,
  ): Promise<void> {
    const res = await commenterApi.delete(
      `/api/articles/${encodeURIComponent(slug)}/comments/${encodeURIComponent(commentId)}`,
    );
    if (res.status() !== 204) {
      throw new Error(
        `CommentFactory.delete() failed: DELETE /api/articles/${slug}/comments/${commentId} ${res.status()} — ${await res.text()}`,
      );
    }
  }
}
