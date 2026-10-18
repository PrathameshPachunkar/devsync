import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
    environment: "node",
    // Each file boots its own in-memory Postgres. WASM startup takes a moment.
    hookTimeout: 30_000,
    testTimeout: 20_000,
  },
});
