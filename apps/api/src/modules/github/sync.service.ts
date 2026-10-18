import { and, boardRepos, eq, sql, type Database } from "@devsync/db";

import type { AppContext } from "../../context";
import { withBoardWrite } from "../../lib/board-write";
import { applyRemoteItems, type ApplyResult } from "./apply";
import { GitHubApiError, type GitHubClient, type GhPull } from "./client";
import { fromIssue, fromPull, type RemoteItem } from "./mapping";

/** A "syncing" claim older than this is from a crashed process and may be retaken. */
const STALE_CLAIM_MINUTES = 10;
/** Checks are fetched per commit, so only for the most recent open PRs. */
const MAX_CHECKED_PULLS = 30;

export type SyncOutcome =
  | ({ status: "synced"; fetched: number } & ApplyResult)
  | { status: "skipped"; reason: "not_linked" | "already_syncing" | "demo" }
  | { status: "failed"; error: string };

export function describeGitHubError(error: unknown): string {
  if (error instanceof GitHubApiError) {
    switch (error.kind) {
      case "rate_limited":
        return `GitHub rate limit reached. Retrying after ${error.resetAt?.toISOString().slice(11, 16) ?? "a while"} UTC`;
      case "not_found":
        return "Repository not found, or the token can't see it";
      case "unauthorized":
        return "GitHub rejected the credentials. Re-link with a new token";
      case "forbidden":
        return "The token is missing permissions for this repository";
      default:
        return error.message;
    }
  }
  return error instanceof Error ? error.message : "Sync failed";
}

/**
 * Atomically claims a link for syncing. Running instances race through this
 * UPDATE, and only one wins, so periodic syncs never double up.
 */
async function claim(db: Database, boardId: string) {
  const [row] = await db
    .update(boardRepos)
    .set({ syncStatus: "syncing", syncStartedAt: new Date() })
    .where(
      and(
        eq(boardRepos.boardId, boardId),
        sql`${boardRepos.authMode} <> 'demo'`,
        sql`(${boardRepos.syncStatus} <> 'syncing' or ${boardRepos.syncStartedAt} < now() - make_interval(mins => ${STALE_CLAIM_MINUTES}))`,
      ),
    )
    .returning();
  return row ?? null;
}

/** Fetches open items (first sync) or everything changed since the last sync. */
export async function fetchRemoteItems(
  client: GitHubClient,
  repo: string,
  options: { since: Date | null; limit: number },
): Promise<RemoteItem[]> {
  const state = options.since ? "all" : "open";
  const issues = await client.listIssues(repo, {
    state,
    limit: options.limit,
    // GitHub's own timestamp: "since" is inclusive, so the newest item is
    // fetched again and then skipped by the stale check.
    ...(options.since ? { since: options.since } : {}),
  });

  const pullNumbers = new Set(issues.filter((i) => i.pull_request).map((i) => i.number));
  const pulls = new Map<number, GhPull>();
  if (pullNumbers.size > 0) {
    // One paginated list call is far cheaper than one call per PR.
    for (const pull of await client.listPulls(repo, { state, limit: options.limit })) {
      if (pullNumbers.has(pull.number)) pulls.set(pull.number, pull);
    }
  }

  const checkTargets = [...pulls.values()]
    .filter((p) => p.state === "open")
    .slice(0, MAX_CHECKED_PULLS);
  const checks = new Map(
    await Promise.all(
      checkTargets.map(
        async (pull) =>
          [
            pull.number,
            await client.getChecksStatus(repo, pull.head.sha).catch(() => undefined),
          ] as const,
      ),
    ),
  );

  return issues.map((issue) => {
    const pull = pulls.get(issue.number);
    return pull ? fromPull(repo, pull, checks.get(issue.number)) : fromIssue(repo, issue);
  });
}

/** Pulls GitHub's current state into one board. Safe to call concurrently. */
export async function syncBoard(ctx: AppContext, boardId: string): Promise<SyncOutcome> {
  const [link] = await ctx.db.select().from(boardRepos).where(eq(boardRepos.boardId, boardId));
  if (!link) return { status: "skipped", reason: "not_linked" };
  if (link.authMode === "demo") return { status: "skipped", reason: "demo" };

  const claimed = await claim(ctx.db, boardId);
  if (!claimed) return { status: "skipped", reason: "already_syncing" };
  const startedAt = new Date();
  const repo = `${claimed.owner}/${claimed.name}`;

  try {
    const client = await ctx.github.clientForLink(claimed);
    const items = await fetchRemoteItems(client, repo, {
      since: claimed.syncCursor,
      limit: ctx.config.githubSyncItemLimit,
    });
    const applied =
      items.length > 0
        ? (await withBoardWrite(ctx.db, boardId, (tx) => applyRemoteItems(tx, boardId, items))).data
        : { created: 0, updated: 0, moved: 0 };

    const newest = items.reduce<Date | null>(
      (max, item) => (!max || item.updatedAt > max ? item.updatedAt : max),
      claimed.syncCursor,
    );
    await ctx.db
      .update(boardRepos)
      .set({
        syncStatus: "idle",
        lastSyncedAt: startedAt,
        syncCursor: newest,
        lastSyncError: null,
        syncStartedAt: null,
      })
      .where(eq(boardRepos.boardId, boardId));
    return { status: "synced", fetched: items.length, ...applied };
  } catch (error) {
    const message = describeGitHubError(error);
    ctx.logger.warn({ err: error, boardId, repo }, "GitHub sync failed");
    await ctx.db
      .update(boardRepos)
      .set({ syncStatus: "error", lastSyncError: message, syncStartedAt: null })
      .where(eq(boardRepos.boardId, boardId));
    return { status: "failed", error: message };
  }
}
