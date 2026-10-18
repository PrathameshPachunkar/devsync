import { createPostgresDatabase } from "@devsync/db";

/**
 * With TEST_DATABASE_URL (CI's Postgres service), every test file shares one
 * database. Migrate it once here, because parallel files migrating at the same
 * time would race on CREATE TABLE. In-memory PGlite (the default) migrates per file.
 */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  const database = createPostgresDatabase(url, 1);
  await database.migrate();
  await database.close();
}
