import type { DatabaseHandle } from "@devsync/db";

import type { AppConfig } from "./config";
import type { AppContext } from "./context";
import type { Logger } from "./lib/logger";
import { createSessionService } from "./modules/auth/session.service";
import { createAccessTokenService } from "./modules/auth/tokens";
import { createGitHubService } from "./modules/github/github.service";
import { createGitHubJobs } from "./modules/github/jobs";

export function createContext(
  config: AppConfig,
  database: DatabaseHandle,
  logger: Logger,
  fetchImpl: typeof fetch = fetch,
): AppContext {
  const tokens = createAccessTokenService(config.jwtSecret, config.accessTokenTtlSeconds);
  const ctx: AppContext = {
    config,
    db: database.db,
    logger,
    tokens,
    sessions: createSessionService(database.db, config, tokens),
    fetch: fetchImpl,
    ping: database.ping,
    github: createGitHubService(config, fetchImpl),
    jobs: null,
  };
  // Jobs need the finished context. They are created here but only started by the server.
  ctx.jobs = createGitHubJobs(ctx);
  return ctx;
}
