import { PrismaClient } from "@prisma/client";

// Neon adapter is wired only when NEON_DATABASE_URL is set (i.e. in prod on
// Vercel). In local dev we hit Postgres via the standard connection string.
// See prisma/schema.prisma and docs/architecture.md for the rationale.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
