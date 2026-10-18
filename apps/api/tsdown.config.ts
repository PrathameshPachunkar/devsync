import { defineConfig } from "tsdown";

/**
 * Production bundle. The workspace packages ship TypeScript source, so they
 * are bundled in. npm dependencies stay external and resolve from
 * node_modules. Migrations are copied next to the bundle, where
 * @devsync/db looks for them.
 */
export default defineConfig({
  entry: ["src/server.ts"],
  format: "esm",
  platform: "node",
  target: "node22",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  deps: { alwaysBundle: [/^@devsync\//] },
  copy: [{ from: "../../packages/db/drizzle", to: "dist" }],
});
