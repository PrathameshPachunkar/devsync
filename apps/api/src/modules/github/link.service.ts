import {
  and,
  boardRepos,
  columns,
  count,
  eq,
  githubItems,
  githubOutbox,
  isNull,
  sql,
  type Database,
} from "@devsync/db";
import {
  parseRepoInput,
  type ColumnDto,
  type GitHubAuthMode,
  type GitHubLinkDto,
  type GitHubRuleDto,
  type GitHubStatusDto,
  type LinkRepoInput,
} from "@devsync/shared";

import type { AppContext } from "../../context";
import { withBoardWrite, type Mutated } from "../../lib/board-write";
import { badRequest, HttpError, notFound } from "../../lib/http-error";
import { toColumnDto } from "../boards/board-dto";
import { GitHubApiError, type GitHubClient, type RemoteRepo } from "./client";
import { describeGitHubError } from "./sync.service";

type LinkRow = typeof boardRepos.$inferSelect;

const PUSH_MODES: readonly GitHubAuthMode[] = ["app", "token"];

function isPublicUrl(url: string) {
  return !/^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(url);
}

async function toLinkDto(db: Database, link: LinkRow): Promise<GitHubLinkDto> {
  const [counts] = await db
    .select({
      pending: count(sql`case when ${githubOutbox.failedAt} is null then 1 end`),
      failed: count(sql`case when ${githubOutbox.failedAt} is not null then 1 end`),
    })
    .from(githubOutbox)
    .where(and(eq(githubOutbox.boardId, link.boardId), isNull(githubOutbox.completedAt)));
  return {
    owner: link.owner,
    name: link.name,
    htmlUrl: `https://github.com/${link.owner}/${link.name}`,
    authMode: link.authMode,
    pushEnabled: link.pushEnabled,
    canPush: PUSH_MODES.includes(link.authMode),
    webhookActive: link.authMode === "app" ? true : link.webhookId !== null,
    syncStatus: link.syncStatus,
    lastSyncedAt: link.lastSyncedAt?.toISOString() ?? null,
    lastSyncError: link.lastSyncError,
    pendingPushes: Number(counts?.pending ?? 0),
    failedPushes: Number(counts?.failed ?? 0),
  };
}

export async function getGitHubStatus(ctx: AppContext, boardId: string): Promise<GitHubStatusDto> {
  const [link] = await ctx.db.select().from(boardRepos).where(eq(boardRepos.boardId, boardId));
  return {
    link: link ? await toLinkDto(ctx.db, link) : null,
    appConfigured: ctx.github.app !== null,
    webhooksConfigured: ctx.github.webhookSecret !== null,
  };
}

/** Turns GitHub failures during linking into clear 4xx answers. */
function linkError(error: unknown): never {
  if (error instanceof GitHubApiError) {
    if (error.kind === "not_found") {
      throw notFound(
        "repo_not_found",
        "Repository not found. Private repos need a token or the GitHub App",
      );
    }
    if (error.kind === "unauthorized")
      throw badRequest("invalid_token", "GitHub rejected that token");
    throw new HttpError(502, "github_unavailable", describeGitHubError(error));
  }
  throw error;
}

interface ResolvedAccess {
  client: GitHubClient;
  repo: RemoteRepo;
  authMode: Exclude<GitHubAuthMode, "demo">;
  installationId: number | null;
  token: string | null;
}

/** Tries, in order: the supplied token, then the GitHub App installation, then public read-only access. */
async function resolveAccess(
  ctx: AppContext,
  owner: string,
  name: string,
  token?: string,
): Promise<ResolvedAccess> {
  try {
    if (token) {
      const client = ctx.github.clientWithToken(token);
      return {
        client,
        repo: await client.getRepo(owner, name),
        authMode: "token",
        installationId: null,
        token,
      };
    }
    if (ctx.github.app) {
      const installationId = await ctx.github.app.installationForRepo(owner, name);
      if (installationId) {
        const client = ctx.github.clientWithToken(
          await ctx.github.app.installationToken(installationId),
        );
        const repo = await client.getRepo(owner, name);
        return {
          client,
          repo: { ...repo, canPush: true },
          authMode: "app",
          installationId,
          token: null,
        };
      }
    }
    const client = ctx.github.clientWithToken(ctx.config.githubToken);
    const repo = await client.getRepo(owner, name);
    if (repo.private) {
      throw badRequest("private_repo", "Private repos need a token or the GitHub App");
    }
    return {
      client,
      repo: { ...repo, canPush: false },
      authMode: "public",
      installationId: null,
      token: null,
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    return linkError(error);
  }
}

async function removeWebhook(ctx: AppContext, link: LinkRow) {
  if (!link.webhookId) return;
  try {
    const client = await ctx.github.clientForLink(link);
    await client.deleteWebhook(`${link.owner}/${link.name}`, link.webhookId);
  } catch (error) {
    ctx.logger.warn({ err: error, boardId: link.boardId }, "Could not delete GitHub webhook");
  }
}

/**
 * Links (or re-links) a board to a repository. The first sync starts in the
 * background, and the response returns right away with status "syncing".
 */
export async function linkRepository(
  ctx: AppContext,
  boardId: string,
  input: LinkRepoInput,
): Promise<GitHubStatusDto> {
  const parsed = parseRepoInput(input.repo);
  if (!parsed) throw badRequest("invalid_repo", "Use owner/name or a GitHub URL");
  const access = await resolveAccess(ctx, parsed.owner, parsed.name, input.token);
  if (input.pushEnabled && !access.repo.canPush) {
    throw badRequest(
      "push_not_permitted",
      access.authMode === "public"
        ? "Updating GitHub needs a token with write access, or the GitHub App"
        : "This token can't write to the repository",
    );
  }

  const [previous] = await ctx.db.select().from(boardRepos).where(eq(boardRepos.boardId, boardId));
  if (previous) await removeWebhook(ctx, previous);
  const sameRepo =
    previous?.githubRepoId === access.repo.id ||
    (previous?.owner.toLowerCase() === access.repo.owner.toLowerCase() &&
      previous?.name.toLowerCase() === access.repo.name.toLowerCase());

  // Repo-level webhooks only work when GitHub can reach this API. The App has its own.
  let webhookId: number | null = null;
  if (
    access.authMode === "token" &&
    ctx.github.webhookSecret &&
    isPublicUrl(ctx.config.apiPublicUrl)
  ) {
    try {
      webhookId = await access.client.createWebhook(
        access.repo.fullName,
        `${ctx.config.apiPublicUrl}/v1/github/webhooks`,
        ctx.github.webhookSecret,
      );
    } catch (error) {
      ctx.logger.info(
        { err: error, boardId },
        "Webhook not created. Falling back to periodic sync",
      );
    }
  }

  await ctx.db.transaction(async (tx) => {
    if (previous && !sameRepo) {
      // Cards from the old repository stay, as plain cards.
      await tx.delete(githubItems).where(eq(githubItems.boardId, boardId));
    }
    await tx
      .delete(githubOutbox)
      .where(and(eq(githubOutbox.boardId, boardId), isNull(githubOutbox.completedAt)));
    const values = {
      owner: access.repo.owner,
      name: access.repo.name,
      githubRepoId: access.repo.id,
      authMode: access.authMode,
      installationId: access.installationId,
      encryptedToken: access.token ? ctx.github.secrets.encrypt(access.token) : null,
      pushEnabled: input.pushEnabled,
      webhookId,
      syncStatus: "idle" as const,
      syncStartedAt: null,
      lastSyncError: null,
      // A different repo starts over with a full sync.
      ...(sameRepo ? {} : { lastSyncedAt: null, syncCursor: null }),
    };
    await tx
      .insert(boardRepos)
      .values({ boardId, ...values })
      .onConflictDoUpdate({ target: boardRepos.boardId, set: values });
  });

  void ctx.jobs?.requestSync(boardId);
  return getGitHubStatus(ctx, boardId);
}

export async function updateLink(ctx: AppContext, boardId: string, pushEnabled: boolean) {
  const [link] = await ctx.db.select().from(boardRepos).where(eq(boardRepos.boardId, boardId));
  if (!link) throw notFound("not_linked", "No repository is linked");
  if (pushEnabled && !PUSH_MODES.includes(link.authMode)) {
    throw badRequest(
      "push_not_permitted",
      "Re-link with a token or the GitHub App to update GitHub",
    );
  }
  await ctx.db.update(boardRepos).set({ pushEnabled }).where(eq(boardRepos.boardId, boardId));
  return getGitHubStatus(ctx, boardId);
}

export async function unlinkRepository(ctx: AppContext, boardId: string) {
  const [link] = await ctx.db.select().from(boardRepos).where(eq(boardRepos.boardId, boardId));
  if (!link) throw notFound("not_linked", "No repository is linked");
  await removeWebhook(ctx, link);
  await withBoardWrite(ctx.db, boardId, async (tx) => {
    await tx.delete(githubItems).where(eq(githubItems.boardId, boardId));
    await tx
      .delete(githubOutbox)
      .where(and(eq(githubOutbox.boardId, boardId), isNull(githubOutbox.completedAt)));
    await tx.delete(boardRepos).where(eq(boardRepos.boardId, boardId));
  });
}

export function setColumnRule(
  db: Database,
  boardId: string,
  columnId: string,
  rule: GitHubRuleDto | null,
): Promise<Mutated<ColumnDto>> {
  return withBoardWrite(db, boardId, async (tx) => {
    const [row] = await tx
      .update(columns)
      .set({ githubRule: rule })
      .where(and(eq(columns.id, columnId), eq(columns.boardId, boardId)))
      .returning();
    if (!row) throw notFound("column_not_found", "Column not found");
    return toColumnDto(row);
  });
}
