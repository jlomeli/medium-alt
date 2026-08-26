// Seed script for local dev. Not run by tests — tests use factories.
// Usage: pnpm db:seed

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  // Intentionally empty for now. Add dev-only seed data here as features land.
  console.log("Seed complete (nothing to seed yet).");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
