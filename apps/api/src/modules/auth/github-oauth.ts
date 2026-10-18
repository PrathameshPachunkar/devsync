import { randomBytes, timingSafeEqual } from "node:crypto";

import { eq, users, type Database } from "@devsync/db";

import type { AppConfig } from "../../config";
import { badRequest, HttpError } from "../../lib/http-error";
import { createBoard } from "../boards/boards.service";

type GitHubConfig = NonNullable<AppConfig["github"]>;

export interface GitHubProfile {
  id: number;
  login: string;
  name: string | null;
  avatarUrl: string | null;
  email: string | null;
}

export function createOAuthState(): string {
  return randomBytes(24).toString("base64url");
}

export function statesMatch(expected: string | undefined, received: string | undefined): boolean {
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Only same-site relative paths, so the callback can't be an open redirect. */
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//"))
    return "/boards";
  return value.slice(0, 512);
}

export function authorizeUrl(github: GitHubConfig, apiPublicUrl: string, state: string): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", github.clientId);
  url.searchParams.set("redirect_uri", `${apiPublicUrl}/v1/auth/github/callback`);
  url.searchParams.set("scope", "read:user user:email");
  url.searchParams.set("state", state);
  url.searchParams.set("allow_signup", "true");
  return url.toString();
}

async function githubJson<T>(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<T> {
  const response = await fetchImpl(url, init);
  if (!response.ok)
    throw new HttpError(502, "github_unavailable", "GitHub sign-in failed. Try again");
  return (await response.json()) as T;
}

/** Exchanges the OAuth code and reads the profile plus primary verified email. */
export async function fetchGitHubProfile(
  fetchImpl: typeof fetch,
  github: GitHubConfig,
  code: string,
): Promise<GitHubProfile> {
  const token = await githubJson<{ access_token?: string; error?: string }>(
    fetchImpl,
    "https://github.com/login/oauth/access_token",
    {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        client_id: github.clientId,
        client_secret: github.clientSecret,
        code,
      }),
    },
  );
  if (!token.access_token) throw badRequest("oauth_failed", "GitHub sign-in was not completed");

  const headers = {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${token.access_token}`,
    "x-github-api-version": "2022-11-28",
    "user-agent": "devsync",
  };
  const [user, emails] = await Promise.all([
    githubJson<{ id: number; login: string; name: string | null; avatar_url: string | null }>(
      fetchImpl,
      "https://api.github.com/user",
      { headers },
    ),
    githubJson<{ email: string; primary: boolean; verified: boolean }[]>(
      fetchImpl,
      "https://api.github.com/user/emails",
      { headers },
    ).catch(() => []),
  ]);
  const primary = emails.find((e) => e.primary && e.verified);
  return {
    id: user.id,
    login: user.login,
    name: user.name,
    avatarUrl: user.avatar_url,
    email: primary?.email.toLowerCase() ?? null,
  };
}

/**
 * Finds or creates the DevSync account for a GitHub identity. Accounts are
 * linked by GitHub id first, then by verified email, so a password user who
 * later signs in with GitHub keeps their boards.
 */
export async function upsertGitHubUser(db: Database, profile: GitHubProfile) {
  return db
    .transaction(async (tx) => {
      const [byGitHub] = await tx.select().from(users).where(eq(users.githubUserId, profile.id));
      if (byGitHub) {
        const [updated] = await tx
          .update(users)
          .set({ githubLogin: profile.login, avatarUrl: profile.avatarUrl ?? byGitHub.avatarUrl })
          .where(eq(users.id, byGitHub.id))
          .returning();
        return { user: updated!, created: false };
      }

      if (profile.email) {
        const [byEmail] = await tx.select().from(users).where(eq(users.email, profile.email));
        if (byEmail && !byEmail.isGuest) {
          const [linked] = await tx
            .update(users)
            .set({
              githubUserId: profile.id,
              githubLogin: profile.login,
              avatarUrl: byEmail.avatarUrl ?? profile.avatarUrl,
            })
            .where(eq(users.id, byEmail.id))
            .returning();
          return { user: linked!, created: false };
        }
      }

      const [created] = await tx
        .insert(users)
        .values({
          name: profile.name ?? profile.login,
          email: profile.email,
          avatarUrl: profile.avatarUrl,
          githubUserId: profile.id,
          githubLogin: profile.login,
        })
        .returning();
      return { user: created!, created: true };
    })
    .then(async (result) => {
      if (result.created) {
        await createBoard(db, result.user.id, {
          name: "My first board",
          description: "Drag cards between columns, or add your own.",
          accent: null,
        });
      }
      return result.user;
    });
}
