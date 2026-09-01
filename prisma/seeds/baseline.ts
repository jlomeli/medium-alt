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

type SeedUser = {
  email: string;
  username: string;
  name: string;
  password: string;
};

type SeedArticle = {
  slug: string;
  title: string;
  subtitle: string | null;
  body: Prisma.InputJsonValue;
  published: boolean;
  publishedAt: Date | null;
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
const USERS: readonly SeedUser[] = [
  {
    email: "alice@medium-alt.test",
    username: "alice",
    name: "Alice Ng",
    password: "Password123!",
  },
  {
    email: "bob@medium-alt.test",
    username: "bob",
    name: "Bob Reyes",
    password: "Password123!",
  },
];

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

const ARTICLES_BY_USERNAME: Record<string, readonly SeedArticle[]> = {
  alice: [
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
  ],
  bob: [
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
    },
  ],
};

// -----------------------------------------------------------------------
// Seed driver
// -----------------------------------------------------------------------

export type BaselineSummary = {
  users: { created: number; skipped: number };
  articles: { created: number; skipped: number };
};

/**
 * Populate the DB with the baseline set. Safe to call repeatedly on the
 * same database — every write is an upsert with an empty `update`, so
 * existing rows are left untouched.
 */
export async function seedBaseline(db: PrismaClient): Promise<BaselineSummary> {
  const summary: BaselineSummary = {
    users: { created: 0, skipped: 0 },
    articles: { created: 0, skipped: 0 },
  };

  for (const user of USERS) {
    const existing = await db.user.findUnique({ where: { email: user.email } });
    if (existing) {
      summary.users.skipped += 1;
      continue;
    }
    // Only hash when we're about to write. `hashPassword` is ~100 ms
    // (argon2id) and there is no point paying it for users that already
    // exist and won't be updated.
    const passwordHash = await hashPassword(user.password);
    await db.user.create({
      data: {
        email: user.email,
        username: user.username,
        name: user.name,
        passwordHash,
      },
    });
    summary.users.created += 1;
  }

  // Second pass — needs the user rows to exist so we can wire authorId.
  for (const [username, articles] of Object.entries(ARTICLES_BY_USERNAME)) {
    const author = await db.user.findUnique({ where: { username } });
    if (!author) {
      throw new Error(`seedBaseline: author @${username} missing — user pass did not run?`);
    }
    for (const article of articles) {
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
        },
      });
      summary.articles.created += 1;
    }
  }

  return summary;
}
