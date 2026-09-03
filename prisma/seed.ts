/**
 * Dev-seed dispatcher — see docs/specs/dev-seed.md.
 *
 * Populates the local database with the canonical baseline scenario
 * (well-known users + articles) so a developer can log in and click
 * through without any manual setup. Wired to `pnpm db:seed` and, via
 * the `prisma.seed` hook in package.json, auto-invoked by
 * `pnpm db:reset`.
 *
 * Not for automated tests — tests use factories under
 * `e2e/support/factories/`. See §Non-goals in the spec.
 *
 * Named scenarios (`pagination`, `edge-cases`, `all`) are deferred; see
 * §Deferred in the spec. This dispatcher stays intentionally trivial
 * until the second scenario actually exists.
 */
import { PrismaClient } from "@prisma/client";
import { seedBaseline } from "./seeds/baseline";

const db = new PrismaClient();

async function main() {
  // Hard production guard. The seed writes fixed, well-known
  // credentials — running it against a production DB would create
  // real login accounts with a documented password. Nothing about
  // this script should ever execute outside dev/CI.
  if (process.env.NODE_ENV === "production") {
    throw new Error("db:seed is dev-only. Refusing to run with NODE_ENV=production.");
  }

  const summary = await seedBaseline(db);
  console.log(
    `[seed] baseline: users +${summary.users.created} (skipped ${summary.users.skipped}), ` +
      `articles +${summary.articles.created} (skipped ${summary.articles.skipped}), ` +
      `tags +${summary.tags.created} (skipped ${summary.tags.skipped}), ` +
      `follows +${summary.follows.created} (skipped ${summary.follows.skipped}), ` +
      `claps +${summary.claps.created} (skipped ${summary.claps.skipped}), ` +
      `comments +${summary.comments.created} (skipped ${summary.comments.skipped}).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
