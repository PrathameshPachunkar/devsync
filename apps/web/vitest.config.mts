import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    // Threads start faster than forked processes, which matters when Turborepo
    // runs builds and the database-backed API tests at the same time.
    pool: "threads",
    // The 120-card render tests are slow under CPU contention (parallel API
    // suites, small CI runners). Generous, but still catches hangs.
    testTimeout: 20_000,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
  },
});
