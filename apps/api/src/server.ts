import { mkdirSync } from "node:fs";

import { createPgliteDatabase, createPostgresDatabase } from "@devsync/db";

import { createApp } from "./app";
import { loadConfig } from "./config";
import { createContext } from "./create-context";
import { createLogger } from "./lib/logger";

// Local convenience: pick up apps/api/.env when present.
try {
  process.loadEnvFile(".env");
} catch {
  // No .env file. Rely on the real environment.
}

const config = loadConfig();
const logger = createLogger(config);

const database =
  config.database.kind === "postgres"
    ? createPostgresDatabase(config.database.url)
    : (() => {
        if (config.database.dataDir) mkdirSync(config.database.dataDir, { recursive: true });
        logger.warn(
          { dataDir: config.database.dataDir ?? "memory" },
          "DATABASE_URL not set. Using embedded PGlite (development only)",
        );
        return createPgliteDatabase(config.database.dataDir);
      })();

await database.migrate();
logger.info({ driver: database.driver }, "Database migrated");

const app = createApp(createContext(config, database, logger));
const server = app.listen(config.port, () => {
  logger.info(`DevSync API listening on http://localhost:${config.port}`);
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "Shutting down");
  server.close();
  await database.close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
