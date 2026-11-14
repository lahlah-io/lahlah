import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Scraper suites are another workstream and still use node:test.
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "tests/unit/scripts/**",
      "tests/integration/destinations.dedupe.test.ts",
      "tests/integration/destinations.persist.test.ts",
    ],
    // Integration suites share PostgreSQL rows and process.env; keep files serial.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
