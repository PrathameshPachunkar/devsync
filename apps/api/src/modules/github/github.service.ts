import type { boardRepos } from "@devsync/db";

import type { AppConfig } from "../../config";
import { createSecretBox, type SecretBox } from "../../lib/crypto";
import { createAppAuth, type AppAuth } from "./app-auth";
import { createGitHubClient, type GitHubClient } from "./client";

type LinkRow = typeof boardRepos.$inferSelect;

/**
 * Picks credentials for a linked repository and hands out clients:
 * GitHub App installation token, then the link's own token, then the
 * server's read-only token, then anonymous access.
 */
export interface GitHubService {
  readonly apiUrl: string;
  readonly app: AppAuth | null;
  readonly webhookSecret: string | null;
  readonly secrets: SecretBox;
  clientWithToken(token: string | null): GitHubClient;
  clientForLink(link: LinkRow): Promise<GitHubClient>;
}

export function createGitHubService(config: AppConfig, fetchImpl: typeof fetch): GitHubService {
  const app = config.githubApp
    ? createAppAuth({ ...config.githubApp, apiUrl: config.githubApiUrl, fetch: fetchImpl })
    : null;
  const secrets = createSecretBox(config.tokenEncryptionKey);
  const clientWithToken = (token: string | null) =>
    createGitHubClient({ fetch: fetchImpl, apiUrl: config.githubApiUrl, token });

  return {
    apiUrl: config.githubApiUrl,
    app,
    webhookSecret: config.githubWebhookSecret,
    secrets,
    clientWithToken,
    async clientForLink(link) {
      if (link.authMode === "app" && app && link.installationId) {
        return clientWithToken(await app.installationToken(link.installationId));
      }
      if (link.authMode === "token" && link.encryptedToken) {
        return clientWithToken(secrets.decrypt(link.encryptedToken));
      }
      return clientWithToken(config.githubToken);
    },
  };
}
