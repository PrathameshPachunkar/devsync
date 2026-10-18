import { and, boardRepos, sql } from "@devsync/db";

import type { AppContext } from "../../context";
import { processOutbox } from "./outbox";
import { syncBoard, type SyncOutcome } from "./sync.service";

export interface GitHubJobs {
  /** Starts (or joins) a sync for one board. */
  requestSync(boardId: string): Promise<SyncOutcome>;
  /** Delivers queued pushes soon, without waiting for the next tick. */
  kick(): void;
  /** Resolves once queued pushes and in-flight syncs are done (tests, shutdown). */
  idle(): Promise<void>;
  start(): void;
  stop(): void;
}

const TICK_MS = 15_000;

/**
 * In-process background work. No Redis or queue server is needed: syncs are
 * claimed atomically in Postgres and outbox rows are leased with SKIP LOCKED,
 * so several API instances can run this side by side safely.
 */
export function createGitHubJobs(ctx: AppContext): GitHubJobs {
  const syncs = new Map<string, Promise<SyncOutcome>>();
  let draining: Promise<void> | null = null;
  let timer: NodeJS.Timeout | null = null;
  let lastScheduleScan = 0;

  function requestSync(boardId: string) {
    let running = syncs.get(boardId);
    if (!running) {
      running = syncBoard(ctx, boardId)
        .catch((error: unknown): SyncOutcome => {
          ctx.logger.error({ err: error, boardId }, "Sync crashed");
          return { status: "failed", error: "Sync crashed" };
        })
        .finally(() => syncs.delete(boardId));
      syncs.set(boardId, running);
    }
    return running;
  }

  function drain() {
    draining ??= (async () => {
      try {
        while ((await processOutbox(ctx)).leased > 0) {
          // Keep going while rows are due.
        }
      } catch (error) {
        ctx.logger.error({ err: error }, "Outbox processing failed");
      } finally {
        draining = null;
      }
    })();
    return draining;
  }

  /** Re-syncs links that haven't synced within the interval. This is the fallback when no webhooks arrive. */
  async function scheduleDueSyncs() {
    const minutes = ctx.config.githubSyncIntervalMinutes;
    if (minutes === 0) return;
    const due = await ctx.db
      .select({ boardId: boardRepos.boardId })
      .from(boardRepos)
      .where(
        and(
          sql`${boardRepos.authMode} <> 'demo'`,
          sql`${boardRepos.syncStatus} <> 'syncing'`,
          sql`(${boardRepos.lastSyncedAt} is null or ${boardRepos.lastSyncedAt} < now() - make_interval(mins => ${minutes}))`,
        ),
      )
      .limit(5);
    for (const { boardId } of due) void requestSync(boardId);
  }

  async function tick() {
    await drain();
    if (Date.now() - lastScheduleScan >= 60_000) {
      lastScheduleScan = Date.now();
      await scheduleDueSyncs().catch((error: unknown) =>
        ctx.logger.error({ err: error }, "Sync scheduling failed"),
      );
    }
  }

  return {
    requestSync,
    kick: () => void drain(),
    async idle() {
      await Promise.all([draining, ...syncs.values()]);
    },
    start() {
      timer ??= setInterval(() => void tick(), TICK_MS);
      timer.unref();
      void tick();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
  };
}
