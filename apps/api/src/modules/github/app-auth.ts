import { createPrivateKey, type KeyObject } from "node:crypto";

import { SignJWT } from "jose";

import { GitHubApiError } from "./client";

interface CachedToken {
  token: string;
  expiresAt: number;
}

/**
 * GitHub App authentication: an RS256 app JWT, exchanged for short-lived
 * installation tokens that are cached until five minutes before expiry.
 */
export function createAppAuth(options: {
  appId: string;
  privateKey: string;
  apiUrl: string;
  fetch: typeof fetch;
}) {
  // Accepts PKCS#1 ("BEGIN RSA PRIVATE KEY", what GitHub issues) and PKCS#8.
  const key: KeyObject = createPrivateKey(options.privateKey);
  const tokens = new Map<number, CachedToken>();

  async function appJwt(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return (
      new SignJWT({})
        .setProtectedHeader({ alg: "RS256" })
        .setIssuer(options.appId)
        // Backdated a minute to tolerate clock drift, as GitHub recommends.
        .setIssuedAt(now - 60)
        .setExpirationTime(now + 9 * 60)
        .sign(key)
    );
  }

  async function appRequest<T>(method: string, path: string): Promise<T> {
    const response = await options.fetch(`${options.apiUrl}${path}`, {
      method,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${await appJwt()}`,
        "x-github-api-version": "2022-11-28",
        "user-agent": "devsync",
      },
    });
    if (!response.ok) {
      const kind = response.status === 404 ? "not_found" : "unauthorized";
      throw new GitHubApiError(
        kind,
        response.status,
        `GitHub App request failed (${response.status})`,
      );
    }
    return (await response.json()) as T;
  }

  return {
    appJwt,
    /** The installation covering a repo, or null when the App isn't installed there. */
    async installationForRepo(owner: string, name: string): Promise<number | null> {
      try {
        const installation = await appRequest<{ id: number }>(
          "GET",
          `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(name)}/installation`,
        );
        return installation.id;
      } catch (error) {
        if (error instanceof GitHubApiError && error.kind === "not_found") return null;
        throw error;
      }
    },
    async installationToken(installationId: number): Promise<string> {
      const cached = tokens.get(installationId);
      if (cached && cached.expiresAt - 5 * 60_000 > Date.now()) return cached.token;
      const created = await appRequest<{ token: string; expires_at: string }>(
        "POST",
        `/app/installations/${installationId}/access_tokens`,
      );
      tokens.set(installationId, {
        token: created.token,
        expiresAt: new Date(created.expires_at).getTime(),
      });
      return created.token;
    },
  };
}

export type AppAuth = ReturnType<typeof createAppAuth>;
