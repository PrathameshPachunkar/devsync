import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3200);
/** Must match NEXT_PUBLIC_API_URL from the web build (default http://localhost:4000). */
const API_PORT = Number(process.env.E2E_API_PORT ?? 4000);

const desktop = {
  ...devices["Desktop Chrome"],
  viewport: { width: 1440, height: 900 },
  ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}),
};

/**
 * Full-stack end-to-end tests: the production web build plus the API on a
 * throwaway in-memory Postgres (PGlite). Every test signs in to its own demo
 * sandbox, so tests never share data.
 *
 * Run `pnpm build` first. To reuse an installed browser instead of
 * downloading one: PW_CHANNEL=msedge pnpm test:e2e
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop",
      testIgnore: /performance\.spec\.ts/,
      use: desktop,
    },
    {
      // Runs alone after the functional suite, so parallel tests do not
      // compete for the CPU and skew the timing.
      name: "performance",
      testMatch: /performance\.spec\.ts/,
      dependencies: ["desktop"],
      fullyParallel: false,
      use: desktop,
    },
  ],
  webServer: [
    {
      command: "pnpm --dir ../api exec tsx src/server.ts",
      url: `http://localhost:${API_PORT}/health`,
      // Never reuse a dev API: its allowed origins and data would differ.
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: "test",
        PORT: String(API_PORT),
        PGLITE_DATA_DIR: "memory",
        WEB_ORIGINS: `http://localhost:${PORT}`,
        WEB_URL: `http://localhost:${PORT}`,
        AUTH_RATE_LIMIT: "100000",
      },
    },
    {
      command: `pnpm exec next start --port ${PORT}`,
      url: `http://localhost:${PORT}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
