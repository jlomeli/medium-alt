#!/usr/bin/env node
/**
 * Wraps `prisma migrate deploy && next build`.
 *
 * Sole job: normalize `DIRECT_URL`. Prisma requires it (see prisma/schema.prisma),
 * but the Neon-Vercel integration exports the unpooled connection under
 * `DATABASE_URL_UNPOOLED` / `POSTGRES_URL_NON_POOLING` — different integration
 * versions name it differently and neither uses `DIRECT_URL`. On CI and local
 * we set `DIRECT_URL` directly and this fallback chain is a no-op.
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
  ["pnpm", ["prisma", "migrate", "deploy"]],
  ["pnpm", ["next", "build"]],
];

for (const [cmd, args] of steps) {
  const result = spawnSync(cmd, args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
