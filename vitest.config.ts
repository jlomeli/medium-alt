import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest is used for pure app-side helpers and Zod schemas ONLY.
 * Browser-level component testing lives in Playwright — see docs/architecture.md.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts"],
    exclude: ["node_modules", "e2e/**", ".next/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
