import type { Database } from "@devsync/db";

import type { AppConfig } from "./config";
import type { Logger } from "./lib/logger";
import type { SessionService } from "./modules/auth/session.service";
import type { AccessTokenService } from "./modules/auth/tokens";
import type { GitHubService } from "./modules/github/github.service";
import type { GitHubJobs } from "./modules/github/jobs";

/** Everything a router needs, injected once so tests can swap any piece. */
export interface AppContext {
  config: AppConfig;
  db: Database;
  logger: Logger;
  tokens: AccessTokenService;
  sessions: SessionService;
  /** Outbound HTTP (GitHub OAuth). Tests pass a fake. */
  fetch: typeof fetch;
  /** Database health check for /health. */
  ping: () => Promise<void>;
  github: GitHubService;
  /** Background sync and push delivery. Tests may drive it directly. */
  jobs: GitHubJobs | null;
}
