import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";

const PORT = 8799;
const root = resolve(import.meta.dirname, "../..");

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 800 },
    trace: "retain-on-failure",
  },
  webServer: {
    // Production-like: build the client, then let the Node server serve it.
    command: `pnpm build && pnpm --filter @explorer/server start`,
    cwd: root,
    env: { PORT: String(PORT), DATA_DIR: resolve(root, "data/e2e-worlds") },
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
