import {
  and,
  boardRepos,
  columns,
  eq,
  githubItems,
  githubOutbox,
  sql,
  type Transaction,
} from "@devsync/db";

import type { AppContext } from "../../context";
import { GitHubApiError } from "./client";
import { describeGitHubError } from "./sync.service";

export const MAX_ATTEMPTS = 6;
/** How long a worker owns a row while it calls GitHub. */
const LEASE = "5 minutes";

export function backoffMs(attempt: number): number {
  return Math.min(30_000 * 2 ** (attempt - 1), 60 * 60_000);
}

/**
 * Called inside the card-move transaction. When the destination column has a
 * GitHub rule and the board pushes to GitHub, queue the change. The move and
 * its outbox row commit together or not at all.
 */
export async function enqueueMoveEffects(
  tx: Transaction,
  boardId: string,
  cardId: string,
  fromColumnId: string,
  toColumnId: string,
): Promise<boolean> {
  if (fromColumnId === toColumnId) return false;

  const [link] = await tx
    .select({ pushEnabled: boardRepos.pushEnabled, authMode: boardRepos.authMode })
    .from(boardRepos)
    .where(eq(boardRepos.boardId, boardId));
  if (!link?.pushEnabled || (link.authMode !== "app" && link.authMode !== "token")) return false;

  const [[item], [column]] = await Promise.all([
    tx
      .select({ repo: githubItems.repo, number: githubItems.number })
      .from(githubItems)
      .where(eq(githubItems.cardId, cardId)),
    tx
      .select({ rule: columns.githubRule })
      .from(columns)
      .where(and(eq(columns.id, toColumnId), eq(columns.boardId, boardId))),
  ]);
  if (!item || !column?.rule) return false;

  await tx.insert(githubOutbox).values({
    boardId,
    cardId,
    payload: { repo: item.repo, number: item.number, rule: column.rule },
  });
  return true;
}

type OutboxRow = typeof githubOutbox.$inferSelect;

/** Leases up to `limit` due rows with SKIP LOCKED, so concurrent workers never share a row. */
async function leaseDue(ctx: AppContext, limit: number): Promise<OutboxRow[]> {
  const result = await ctx.db.execute(sql`
    update ${githubOutbox}
    set next_attempt_at = now() + interval '${sql.raw(LEASE)}', attempts = attempts + 1
    where id in (
      select id from ${githubOutbox}
      where completed_at is null and failed_at is null and next_attempt_at <= now()
      order by created_at
      limit ${limit}
      for update skip locked
    )
    returning id`);
  const ids = (result.rows as { id: string }[]).map((r) => r.id);
  if (ids.length === 0) return [];
  const rows = await ctx.db
    .select()
    .from(githubOutbox)
    .where(
      sql`${githubOutbox.id} in (${sql.join(
        ids.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})`,
    );
  return rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

async function deliver(ctx: AppContext, row: OutboxRow): Promise<void> {
  const [link] = await ctx.db.select().from(boardRepos).where(eq(boardRepos.boardId, row.boardId));
  // Unlinked or push turned off since the move: nothing to deliver.
  if (!link?.pushEnabled) return;

  const client = await ctx.github.clientForLink(link);
  const { repo, number, rule } = row.payload;

  if (rule.state) {
    const issue = await client.setIssueState(repo, number, rule.state);
    // Record GitHub's own timestamp, so the webhook echo of this change is
    // recognized as already applied.
    await ctx.db
      .update(githubItems)
      .set({
        remoteUpdatedAt: new Date(issue.updated_at),
        state: issue.pull_request?.merged_at ? "merged" : issue.state,
      })
      .where(
        and(
          eq(githubItems.boardId, row.boardId),
          eq(githubItems.repo, repo),
          eq(githubItems.number, number),
        ),
      );
  }
  if (rule.addLabels?.length) await client.addLabels(repo, number, rule.addLabels);
  for (const label of rule.removeLabels ?? []) await client.removeLabel(repo, number, label);
}

/**
 * Delivers due outbox rows. Each row is retried with exponential backoff and
 * marked failed after MAX_ATTEMPTS. Errors that can never succeed (404 or a
 * validation error) fail immediately.
 */
export async function processOutbox(ctx: AppContext, limit = 10) {
  const rows = await leaseDue(ctx, limit);
  let delivered = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      await deliver(ctx, row);
      await ctx.db
        .update(githubOutbox)
        .set({ completedAt: new Date(), lastError: null })
        .where(eq(githubOutbox.id, row.id));
      delivered += 1;
    } catch (error) {
      const permanent =
        error instanceof GitHubApiError &&
        (error.kind === "not_found" || error.kind === "validation");
      const giveUp = permanent || row.attempts >= MAX_ATTEMPTS;
      const retryAt =
        error instanceof GitHubApiError && error.resetAt
          ? error.resetAt
          : new Date(Date.now() + backoffMs(row.attempts));
      await ctx.db
        .update(githubOutbox)
        .set({
          lastError: describeGitHubError(error),
          ...(giveUp ? { failedAt: new Date() } : { nextAttemptAt: retryAt }),
        })
        .where(eq(githubOutbox.id, row.id));
      if (giveUp) failed += 1;
      ctx.logger.warn(
        { err: error, outboxId: row.id, attempt: row.attempts },
        "GitHub push failed",
      );
    }
  }
  return { leased: rows.length, delivered, failed };
}
