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
