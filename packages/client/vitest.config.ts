import { defineConfig } from "vitest/config";

// Unit tests only; e2e/ holds Playwright specs (pnpm test:e2e).
export default defineConfig({
  test: { include: ["src/**/*.test.ts"] },
});
