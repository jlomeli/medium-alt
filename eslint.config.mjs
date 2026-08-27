import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: import.meta.dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      ".next/**",
      "next-env.d.ts",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "e2e/.auth/**",
    ],
  },
  {
    // Allow `_`-prefixed unused vars project-wide — matches the convention we
    // use to mark intentionally-computed-but-unused values (see the auth-feature
    // TODOs in e2e/support/factories/user.factory.ts).
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Playwright fixtures use `({ ... }, use) => { await use(x) }`. React 19
    // added a real `use()` hook, so `react-hooks/rules-of-hooks` now flags every
    // Playwright fixture as "calling a hook outside a component". The rule has
    // no meaning inside Playwright test setup — turn it off for the e2e tree.
    files: ["e2e/**/*.ts"],
    rules: {
      "react-hooks/rules-of-hooks": "off",
    },
  },
];

export default eslintConfig;
