import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import pg from "pg";

import * as schema from "./schema";

export type Schema = typeof schema;

/**
 * Services are written against the node-postgres type. The PGlite driver
 * exposes the same query-builder API at runtime, so one type covers both.
 */
export type Database = NodePgDatabase<Schema>;
export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type DbOrTx = Database | Transaction;

export interface DatabaseHandle {
  db: Database;
  driver: "postgres" | "pglite";
  migrate: () => Promise<void>;
  ping: () => Promise<void>;
  close: () => Promise<void>;
}

/**
 * Migrations live in packages/db/drizzle. When the API is bundled they are
 * copied next to the bundle, so look in both places.
 */
export function resolveMigrationsFolder(): string {
  const candidates = [
    process.env.MIGRATIONS_DIR,
    fileURLToPath(new URL("../drizzle", import.meta.url)),
    fileURLToPath(new URL("./drizzle", import.meta.url)),
  ].filter((dir): dir is string => Boolean(dir));
  const found = candidates.find((dir) => existsSync(`${dir}/meta/_journal.json`));
  if (!found) throw new Error(`Migrations not found. Looked in: ${candidates.join(", ")}`);
  return found;
}

export function createPostgresDatabase(connectionString: string, poolSize = 10): DatabaseHandle {
  const pool = new pg.Pool({ connectionString, max: poolSize });
  const db = drizzlePg(pool, { schema });
  return {
    db,
    driver: "postgres",
    migrate: () => migratePg(db, { migrationsFolder: resolveMigrationsFolder() }),
    ping: async () => {
      await pool.query("select 1");
    },
    close: () => pool.end(),
  };
}

/**
 * Embedded Postgres (WASM). `dataDir` persists to disk, and leaving it out
 * keeps everything in memory, which tests use for isolation. Local
 * development runs with zero setup this way.
 */
export function createPgliteDatabase(dataDir?: string): DatabaseHandle {
  const client = new PGlite(dataDir);
  const db = drizzlePglite(client, { schema }) as unknown as Database;
  return {
    db,
    driver: "pglite",
    migrate: () => migratePglite(db as never, { migrationsFolder: resolveMigrationsFolder() }),
    ping: async () => {
      await client.query("select 1");
    },
    close: () => client.close(),
  };
}
