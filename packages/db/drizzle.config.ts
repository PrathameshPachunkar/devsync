import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./drizzle",
  // Only used by `drizzle-kit studio`. Migrations are applied by the API.
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://devsync:devsync@localhost:5432/devsync",
  },
  strict: true,
});
