/**
 * Baseline dev-seed scenario — see docs/specs/dev-seed.md.
 *
 * Populates a small, well-known set of users and articles that a
 * developer can log in as and click through. Not for automated tests
 * (which use the factories under `e2e/support/factories/`). Idempotent:
 * users are upserted by `email`, articles by `slug`, with an empty
 * `update` clause so a second run touches nothing.
 *
 * All timestamps are fixed constants so re-runs never mutate the row.
 * Slugs are hand-written (not via `slugify()`) because that helper
 * appends a random hex suffix — fine for the app, incompatible with
 * an upsert-by-slug idempotency contract.
 */
import type { PrismaClient, Prisma } from "@prisma/client";
import { hashPassword } from "@/lib/auth/password";
import { bodySchema } from "@/lib/validation/article";

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

type SeedArticle = {
  slug: string;
  title: string;
  subtitle: string | null;
  body: Prisma.InputJsonValue;
  published: boolean;
  publishedAt: Date | null;
  /**
   * Slice 5 — tag slugs to attach to the article. Colocated with the
   * article rather than a separate mapping so a `git blame` on a slug
   * points at the article that owns it. Kept `readonly` so the fixture
   * data can't be mutated at runtime by the seed loop.
   */
  tags?: readonly string[];
};

/**
 * Articles are colocated with their author (rather than keyed by
 * `username` in a side table) so both passes look up authors by the
 * same stable identity — `email`. `username` is user-mutable via
 * `PATCH /api/me` (see `lib/validation/profile.ts::updateMeSchema`),
 * so a developer who logs in as Alice and renames her would otherwise
 * break the next `pnpm db:seed` with a misleading "author @alice
 * missing" error. Email is not mutable through any current API and
 * makes for a stable seed identity.
 */
type SeedUser = {
  email: string;
  username: string;
  name: string;
  password: string;
  articles: readonly SeedArticle[];
};

// -----------------------------------------------------------------------
// Baseline content
// -----------------------------------------------------------------------

/**
 * Well-known credentials. Documented in `docs/how-to/seed.md`. The
 * `@medium-alt.test` domain is deliberate: a reserved-style TLD makes
 * it obvious these are not real accounts and prevents accidental email
 * delivery through Mailpit or a real SMTP relay.
 */
// USERS is defined below the article arrays so each user can reference
// its own articles by name — see the bottom of this section.

/** Build a tiny, valid Tiptap ProseMirror doc: one h2 + one paragraph. */
function makeBody(heading: string, paragraph: string): Prisma.InputJsonValue {
  const doc = {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: heading }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: paragraph }],
      },
    ],
  };
  // Round-trip through the real body validator so a tightened schema
  // (new required attr, narrower allowlist, …) breaks the seed on the
  // PR that introduces it, not months later on the next `db:reset`.
  const parsed = bodySchema.parse(doc);
  return parsed as Prisma.InputJsonValue;
}

/**
 * Fixed publish timestamps. Constants (not `new Date()`) so re-running
 * the seed doesn't mutate the row — required for the idempotency
 * guarantee documented in the spec.
 */
const T = {
  aliceOne: new Date("2026-08-01T12:00:00Z"),
  aliceTwo: new Date("2026-08-08T12:00:00Z"),
  aliceThree: new Date("2026-08-15T12:00:00Z"),
  bobOne: new Date("2026-08-05T12:00:00Z"),
  bobTwo: new Date("2026-08-20T12:00:00Z"),
} as const;

const ALICE_ARTICLES: readonly SeedArticle[] = [
  {
    slug: "alice-welcome-to-medium-alt",
    title: "Welcome to Medium-Alt",
    subtitle: "A tour of the reading and writing experience.",
    body: makeBody(
      "What this app is",
      "Medium-Alt is a small clone built as a substrate for practicing an E2E automation framework and an agentic PR review pipeline.",
    ),
    published: true,
    publishedAt: T.aliceOne,
    tags: ["writing", "intro"],
  },
  {
    slug: "alice-writing-your-first-article",
    title: "Writing your first article",
    subtitle: "From blank canvas to publish button.",
    body: makeBody(
      "Getting started",
      "Head to the editor, give it a title, drop in a few paragraphs, then hit publish. Your article will show up on your profile and on its own reading page.",
    ),
    published: true,
    publishedAt: T.aliceTwo,
    tags: ["writing", "editor"],
  },
  {
    slug: "alice-notes-on-the-editor",
    title: "Notes on the editor",
    subtitle: "Headings, lists, links, images — what works today.",
    body: makeBody(
      "Formatting basics",
      "The editor supports headings, ordered and unordered lists, blockquotes, inline code, links, and inline images. The renderer stays in lockstep with a strict allowlist on the server.",
    ),
    published: true,
    publishedAt: T.aliceThree,
    tags: ["editor"],
  },
  {
    slug: "alice-draft-thoughts-on-follows",
    title: "Draft: thoughts on follows",
    subtitle: "Rough sketch, not ready to publish.",
    body: makeBody(
      "Kicking around",
      "This is a draft article. It should be visible to Alice but not to anonymous readers or other users.",
    ),
    published: false,
    publishedAt: null,
  },
];

const BOB_ARTICLES: readonly SeedArticle[] = [
  {
    slug: "bob-hello-from-bob",
    title: "Hello from Bob",
    subtitle: "A short introduction.",
    body: makeBody(
      "Hi",
      "I'm Bob. This is my first post on Medium-Alt. Nice to meet you.",
    ),
    published: true,
    publishedAt: T.bobOne,
    tags: ["intro"],
  },
  {
    slug: "bob-things-i-am-reading",
    title: "Things I am reading",
    subtitle: "A short list, updated occasionally.",
    body: makeBody(
      "Currently on the pile",
      "A grab-bag of essays, papers, and blog posts I've bookmarked over the last month.",
    ),
    published: true,
    publishedAt: T.bobTwo,
    tags: ["reading"],
  },
];

const USERS: readonly SeedUser[] = [
  {
    email: "alice@medium-alt.test",
    username: "alice",
    name: "Alice Ng",
    password: "Password123!",
    articles: ALICE_ARTICLES,
  },
  {
    email: "bob@medium-alt.test",
    username: "bob",
    name: "Bob Reyes",
    password: "Password123!",
    articles: BOB_ARTICLES,
  },
];

// -----------------------------------------------------------------------
// Seed driver
// -----------------------------------------------------------------------

export type BaselineSummary = {
  users: { created: number; skipped: number };
  articles: { created: number; skipped: number };
  tags: { created: number; skipped: number };
  follows: { created: number; skipped: number };
  claps: { created: number; skipped: number };
};

/**
 * Slice 6 — baseline follow edges. Bob follows Alice so a fresh
 * `pnpm db:seed` gives:
 *   - Logged in as Bob → `/?feed=me` shows Alice's published
 *     articles (non-empty Your Feed on first look).
 *   - Logged in as Alice → `/?feed=me` shows the empty state
 *     (Alice follows nobody in the baseline).
 * Both directions of the acceptance criteria are demoable without any
 * test-only setup. Keyed by (follower, following) email so the source
 * text is legible without cross-referencing the user block.
 */
const BASELINE_FOLLOWS: readonly {
  followerEmail: string;
  followingEmail: string;
}[] = [
  { followerEmail: "bob@medium-alt.test", followingEmail: "alice@medium-alt.test" },
];

/**
 * Slice 7 — baseline claps. Bob claps 5× for Alice's welcome article
 * so a fresh `pnpm db:seed` gives:
 *   - Alice's article read view shows a non-zero total-clap count.
 *   - Logged in as Bob → the same read view shows `Clapped (5)`,
 *     demoing the "reload preserves state" story without any manual
 *     click round.
 *   - The Global feed card for that article shows a non-zero clap
 *     glyph, demoing the "counts on cards" story without publishing
 *     new articles.
 * Keyed by (reader email, article slug) so the source text is legible
 * without cross-referencing the article block. `count` is set
 * directly (not looped through the POST endpoint) — seeds set state,
 * they don't drive UI. Same idempotency shape as follows.
 */
const BASELINE_CLAPS: readonly {
  readerEmail: string;
  articleSlug: string;
  count: number;
}[] = [
  {
    readerEmail: "bob@medium-alt.test",
    articleSlug: "alice-welcome-to-medium-alt",
    count: 5,
  },
];

/**
 * Slice 5 — every unique tag slug referenced by a seeded article.
 * Derived from `USERS` at module load so `git diff` on a single tag
 * change touches exactly the article + this comment. Keys are slugs;
 * display names are the same as the slug (baseline tags are already
 * lowercase-friendly words), matching what the app's tag normaliser
 * would produce if an author typed them into the editor.
 */
const BASELINE_TAGS: readonly { slug: string; name: string }[] = (() => {
  const seen = new Map<string, string>();
  for (const user of USERS) {
    for (const article of user.articles) {
      for (const slug of article.tags ?? []) {
        if (!seen.has(slug)) seen.set(slug, slug);
      }
    }
  }
  return [...seen.entries()].map(([slug, name]) => ({ slug, name }));
})();

/**
 * Populate the DB with the baseline set. Safe to call repeatedly on the
 * same database — every write is an upsert with an empty `update`, so
 * existing rows are left untouched.
 */
export async function seedBaseline(db: PrismaClient): Promise<BaselineSummary> {
  const summary: BaselineSummary = {
    users: { created: 0, skipped: 0 },
    articles: { created: 0, skipped: 0 },
    tags: { created: 0, skipped: 0 },
    follows: { created: 0, skipped: 0 },
    claps: { created: 0, skipped: 0 },
  };

  // Slice 5 — ensure every baseline tag exists BEFORE the article loop
  // so each article's `connect: [{ slug }]` finds a real row. Same
  // findUnique + create idempotency contract as users/articles; the
  // schema has no `updatedAt` on `Tag`, so a naïve `upsert({ update: {} })`
  // would be safe today, but the explicit branch keeps the counters
  // truthful and matches the rest of this file.
  for (const tag of BASELINE_TAGS) {
    const existing = await db.tag.findUnique({
      where: { slug: tag.slug },
      select: { id: true },
    });
    if (existing) {
      summary.tags.skipped += 1;
    } else {
      await db.tag.create({ data: { slug: tag.slug, name: tag.name } });
      summary.tags.created += 1;
    }
  }

  for (const user of USERS) {
    // Look up (or create) the user by email — the single stable
    // identity. `username` is user-mutable via PATCH /api/me, so
    // keying anything downstream on it would let a developer break
    // seed idempotency by renaming a seeded user through the app.
    let author = await db.user.findUnique({
      where: { email: user.email },
      select: { id: true },
    });
    if (author) {
      summary.users.skipped += 1;
    } else {
      // Only hash when we're about to write. `hashPassword` is ~100 ms
      // (argon2id) and there is no point paying it for users that
      // already exist and won't be updated.
      const passwordHash = await hashPassword(user.password);
      author = await db.user.create({
        data: {
          email: user.email,
          username: user.username,
          name: user.name,
          passwordHash,
        },
        select: { id: true },
      });
      summary.users.created += 1;
    }

    for (const article of user.articles) {
      // findUnique + create rather than `upsert({ update: {} })` — the
      // upsert path still bumps `updatedAt` (Prisma issues the UPDATE
      // even with an empty `update` clause), which breaks the "second
      // run touches nothing" guarantee and made the created/skipped
      // counters lie. Matches the user-branch pattern above.
      const existing = await db.article.findUnique({
        where: { slug: article.slug },
        select: { id: true },
      });
      if (existing) {
        summary.articles.skipped += 1;
        continue;
      }
      await db.article.create({
        data: {
          slug: article.slug,
          title: article.title,
          subtitle: article.subtitle,
          body: article.body,
          published: article.published,
          publishedAt: article.publishedAt,
          authorId: author.id,
          // Tags are always safe to `connect` here — the pre-loop
          // above guarantees every referenced slug exists. Article is
          // new (we're in the `!existing` branch), so no `set` needed.
          ...(article.tags && article.tags.length > 0
            ? {
                tags: {
                  connect: article.tags.map((slug) => ({ slug })),
                },
              }
            : {}),
        },
      });
      summary.articles.created += 1;
    }
  }

  // Slice 6 — baseline follows. Resolve both sides by email (the
  // stable identity used everywhere else in this seed) so the file
  // reads as a self-describing graph. findUnique + create matches
  // the article-branch idempotency: composite `@@id([followerId,
  // followingId])` gives us the natural existence check.
  for (const edge of BASELINE_FOLLOWS) {
    const [follower, following] = await Promise.all([
      db.user.findUnique({
        where: { email: edge.followerEmail },
        select: { id: true },
      }),
      db.user.findUnique({
        where: { email: edge.followingEmail },
        select: { id: true },
      }),
    ]);
    if (!follower || !following) {
      // A missing endpoint means the USERS block above was edited
      // without updating BASELINE_FOLLOWS — loud error beats a
      // silently-skipped edge.
      throw new Error(
        `Baseline follow ${edge.followerEmail} → ${edge.followingEmail} references a user that isn't in USERS`,
      );
    }
    const existing = await db.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: follower.id,
          followingId: following.id,
        },
      },
      select: { followerId: true },
    });
    if (existing) {
      summary.follows.skipped += 1;
    } else {
      await db.follow.create({
        data: { followerId: follower.id, followingId: following.id },
      });
      summary.follows.created += 1;
    }
  }

  // Slice 7 — baseline claps. Resolve reader by email + article by
  // slug (both stable identities). findUnique + create on the
  // composite `@@id([userId, articleId])` matches the follow-branch
  // idempotency; on second run the existing row is left untouched
  // and the counter reports it as `skipped`. `count` is set
  // directly (not looped via the POST endpoint) — seeds set state,
  // they don't drive UI.
  for (const edge of BASELINE_CLAPS) {
    const [reader, article] = await Promise.all([
      db.user.findUnique({
        where: { email: edge.readerEmail },
        select: { id: true },
      }),
      db.article.findUnique({
        where: { slug: edge.articleSlug },
        select: { id: true, authorId: true },
      }),
    ]);
    if (!reader || !article) {
      // A missing endpoint means USERS / ALICE_ARTICLES / BOB_ARTICLES
      // was edited without updating BASELINE_CLAPS — loud error beats
      // a silently-skipped clap.
      throw new Error(
        `Baseline clap by ${edge.readerEmail} on ${edge.articleSlug} references a user/article that isn't in the baseline`,
      );
    }
    if (reader.id === article.authorId) {
      // Self-clap is rejected by the API; the seed is not a back door.
      throw new Error(
        `Baseline clap by ${edge.readerEmail} on ${edge.articleSlug} is a self-clap — the reader authored the article`,
      );
    }
    const existing = await db.clap.findUnique({
      where: { userId_articleId: { userId: reader.id, articleId: article.id } },
      select: { userId: true },
    });
    if (existing) {
      summary.claps.skipped += 1;
    } else {
      await db.clap.create({
        data: {
          userId: reader.id,
          articleId: article.id,
          count: edge.count,
        },
      });
      summary.claps.created += 1;
    }
  }

  return summary;
}
