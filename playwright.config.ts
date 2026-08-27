import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

/**
 * Playwright config for medium-alt.
 *
 * Design notes:
 *   - `webServer` boots `pnpm dev` unless a base URL is provided via
 *     `E2E_BASE_URL` (used in CI against a Vercel preview).
 *   - Three browser projects for UI + one dedicated `api` project for
 *     HTTP-only tests. See docs/architecture.md §E2E.
 *   - Tag-based selection via `--grep '@smoke'` / `--grep-invert '@slow'`.
 *   - Sharding: pass `--shard 1/4` in CI.
 */

const BASE_URL = process.env.E2E_BASE_URL || "http://localhost:3000";
const IS_CI = !!process.env.CI;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: IS_CI,
  retries: IS_CI ? 2 : 0,
  workers: IS_CI ? 4 : undefined,
  reporter: IS_CI
    ? [["html", { outputFolder: "playwright-report" }], ["github"], ["list"]]
    : [["html", { outputFolder: "playwright-report" }], ["list"]],
  timeout: 30_000,
  expect: {
    timeout: 5_000,
    // Visual regression tolerances — tune as baselines settle.
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.01,
      threshold: 0.2,
      animations: "disabled",
    },
  },
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    // API-only tests: no browser, no baseURL trace.
    {
      name: "api",
      testMatch: /e2e\/api\/.*\.spec\.ts$/,
      use: { baseURL: BASE_URL },
    },
    // UI tests across browsers.
    {
      name: "chromium",
      testMatch: /e2e\/tests\/.*\.spec\.ts$/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "webkit",
      testMatch: /e2e\/tests\/.*\.spec\.ts$/,
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "firefox",
      testMatch: /e2e\/tests\/.*\.spec\.ts$/,
      use: { ...devices["Desktop Firefox"] },
    },
  ],
  outputDir: path.join(process.cwd(), "test-results"),
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm dev",
        url: "http://localhost:3000",
        reuseExistingServer: !IS_CI,
        timeout: 120_000,
        stdout: "pipe",
        stderr: "pipe",
        // Enables env-gated test seams under /api/test/* — see
        // docs/specs/auth.md §Testing seams.
        env: { E2E: "1" },
      },
});
