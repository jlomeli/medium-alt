#!/usr/bin/env node
/**
 * Wraps `prisma generate && prisma migrate deploy && next build`.
 *
 * Two jobs:
 *
 * 1. **`prisma generate` first, always.** Vercel restores `node_modules`
 *    from its build cache when the lockfile is unchanged, which makes
 *    `pnpm install` short-circuit with "Already up to date" and skip
 *    the `postinstall` hook that would normally regenerate the client.
 *    A schema change (new model / new field) then reaches `next build`
 *    with a stale client and the type-check fails with "Property 'x'
 *    does not exist on type 'PrismaClient'". Running `prisma generate`
 *    here is idempotent and cheap (~1s) and closes the cache-hit hole.
 *
 * 2. **Normalize `DIRECT_URL`.** Prisma requires it (see prisma/schema.prisma),
 *    but the Neon-Vercel integration exports the unpooled connection under
 *    `DATABASE_URL_UNPOOLED` / `POSTGRES_URL_NON_POOLING` — different integration
 *    versions name it differently and neither uses `DIRECT_URL`. On CI and local
 *    we set `DIRECT_URL` directly and this fallback chain is a no-op.
 *
 * Falls back to `DATABASE_URL` last-resort so a single-URL setup still works
 * even if migrations against a pgbouncer-pooled URL are slower.
 */
import { spawnSync } from "node:child_process";

/**
 * Preflight: fail fast with a legible message when the DB URL is empty.
 *
 * A Vercel "linked" secret that no longer resolves comes through as the empty
 * string, not `undefined` — `process.env.DATABASE_URL === ""`. Prisma then
 * dies mid-build with P1012 "You must provide a nonempty URL. The environment
 * variable DATABASE_URL resolved to an empty string," which is easy to miss
 * in a long build log. This check surfaces it as the first line of output.
 *
 * We only guard `DATABASE_URL` here. `DIRECT_URL` is normalized below and its
 * final empty-ness is checked after the fallback chain runs.
 */
if (!process.env.DATABASE_URL) {
  console.error(
    "[build] DATABASE_URL is empty or unset. On Vercel this usually means a " +
      "linked secret was rotated/removed; re-set it via `vercel env add " +
      "DATABASE_URL <target>` and redeploy. See .env.example for shape.",
  );
  process.exit(1);
}

if (!process.env.DIRECT_URL) {
  // Try known Neon-Vercel integration names. If none are set at this
  // process level, let the subprocesses fall back to their own .env
  // loading — Prisma and Next both do that automatically. Only local dev
  // relies on that path (Vercel doesn't ship .env into builds).
  const source =
    (process.env.DATABASE_URL_UNPOOLED && "DATABASE_URL_UNPOOLED") ||
    (process.env.POSTGRES_URL_NON_POOLING && "POSTGRES_URL_NON_POOLING") ||
    (process.env.DATABASE_URL && "DATABASE_URL");
  if (source) {
    process.env.DIRECT_URL = process.env[source];
    console.log(`[build] DIRECT_URL was unset; using ${source}`);
  }
}

// Post-fallback check: if DIRECT_URL is still empty after the chain above,
// `prisma migrate deploy` would fail with the same P1012 as the DATABASE_URL
// case. Same treatment — surface it early with an actionable message.
if (!process.env.DIRECT_URL) {
  console.error(
    "[build] DIRECT_URL is empty and no fallback env var was set " +
      "(DATABASE_URL_UNPOOLED, POSTGRES_URL_NON_POOLING, DATABASE_URL). " +
      "Prisma migrations need a non-pooled URL — set DIRECT_URL directly or " +
      "confirm the Neon-Vercel integration is populating one of the fallbacks.",
  );
  process.exit(1);
}

const steps = [
  ["pnpm", ["prisma", "generate"]],
  ["pnpm", ["prisma", "migrate", "deploy"]],
  ["pnpm", ["next", "build"]],
];

for (const [cmd, args] of steps) {
  const result = spawnSync(cmd, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
