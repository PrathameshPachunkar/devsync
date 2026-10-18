import { randomUUID } from "node:crypto";

import {
  and,
  boardRepos,
  cardLabels,
  cards,
  columns,
  eq,
  githubIgnored,
  githubItems,
  inArray,
  labels,
  sql,
  type Transaction,
} from "@devsync/db";
import { byPosition, positionBetween } from "@devsync/shared";

import { isClosed, type RemoteItem } from "./mapping";

export interface ApplyResult {
  created: number;
  updated: number;
  moved: number;
}

type ColumnRow = Pick<typeof columns.$inferSelect, "id" | "position" | "githubRule">;

/**
 * Where synced cards go. New and reopened items land in the inbox: the first
 * column without a "close" rule. Closed items go to the column whose rule
 * closes issues, or else the last column.
 */
export function targetColumns(boardColumns: ColumnRow[], inboxColumnId?: string | null) {
  const sorted = [...boardColumns].sort(byPosition);
  const closes = (c: ColumnRow) => c.githubRule?.state === "closed";
  const inbox =
    sorted.find((c) => c.id === inboxColumnId) ?? sorted.find((c) => !closes(c)) ?? sorted[0];
  const done = sorted.find(closes) ?? sorted.at(-1);
  return { inbox: inbox?.id ?? null, done: done?.id ?? null, closes };
}

/**
 * Applies GitHub's view of some issues and PRs to one board. Runs inside a
 * board write transaction. It is used by full syncs and by single-item webhooks.
 *
 * - Stale data (older updated_at than stored) is ignored, so out-of-order
 *   webhooks and slow syncs can't overwrite newer state.
 * - Only open items create cards. Closed history isn't imported.
 * - Cards move only when the GitHub state changes, so manual arrangement
 *   survives every other update.
 */
export async function applyRemoteItems(
  tx: Transaction,
  boardId: string,
  items: RemoteItem[],
): Promise<ApplyResult> {
  const result: ApplyResult = { created: 0, updated: 0, moved: 0 };
  if (items.length === 0) return result;

  const boardColumns = await tx
    .select({ id: columns.id, position: columns.position, githubRule: columns.githubRule })
    .from(columns)
    .where(eq(columns.boardId, boardId));
  if (boardColumns.length === 0) return result;
  const { inbox, done, closes } = targetColumns(boardColumns);
  const columnById = new Map(boardColumns.map((c) => [c.id, c]));

  const repos = [...new Set(items.map((i) => i.repo))];
  const numbers = [...new Set(items.map((i) => i.number))];
  const [existing, ignored] = await Promise.all([
    tx
      .select({
        cardId: githubItems.cardId,
        repo: githubItems.repo,
        number: githubItems.number,
        state: githubItems.state,
        remoteUpdatedAt: githubItems.remoteUpdatedAt,
        columnId: cards.columnId,
      })
      .from(githubItems)
      .innerJoin(cards, eq(cards.id, githubItems.cardId))
      .where(
        and(
          eq(githubItems.boardId, boardId),
          inArray(githubItems.repo, repos),
          inArray(githubItems.number, numbers),
        ),
      ),
    tx
      .select({ repo: githubIgnored.repo, number: githubIgnored.number })
      .from(githubIgnored)
      .where(and(eq(githubIgnored.boardId, boardId), inArray(githubIgnored.number, numbers))),
  ]);
  const key = (repo: string, number: number) => `${repo}#${number}`;
  const existingByKey = new Map(existing.map((e) => [key(e.repo, e.number), e]));
  const ignoredKeys = new Set(ignored.map((i) => key(i.repo, i.number)));

  // Labels: GitHub is the source of truth for linked cards. Upsert by name.
  const labelColors = new Map(
    items.flatMap((i) => i.labels.map((l) => [l.name, l.color] as const)),
  );
  const labelIds = new Map<string, string>();
  if (labelColors.size > 0) {
    const rows = await tx
      .insert(labels)
      .values([...labelColors].map(([name, color]) => ({ boardId, name, color })))
      .onConflictDoUpdate({
        target: [labels.boardId, labels.name],
        set: { color: sql`excluded.color` },
      })
      .returning({ id: labels.id, name: labels.name });
    for (const row of rows) labelIds.set(row.name, row.id);
  }

  // Appends land after the current last card of each column.
  const lastPosition = new Map<string, string | null>();
  async function appendPosition(columnId: string) {
    if (!lastPosition.has(columnId)) {
      const [row] = await tx
        .select({ position: cards.position })
        .from(cards)
        .where(eq(cards.columnId, columnId))
        .orderBy(sql`${cards.position} desc`)
        .limit(1);
      lastPosition.set(columnId, row?.position ?? null);
    }
    const position = positionBetween(lastPosition.get(columnId) ?? null, null);
    lastPosition.set(columnId, position);
    return position;
  }

  async function setCardLabels(cardId: string, item: RemoteItem) {
    await tx.delete(cardLabels).where(eq(cardLabels.cardId, cardId));
    const ids = item.labels.map((l) => labelIds.get(l.name)).filter((id): id is string => !!id);
    if (ids.length) await tx.insert(cardLabels).values(ids.map((labelId) => ({ cardId, labelId })));
  }

  // Unknown (undefined) fields are left out, so stored values survive.
  const mirror = (item: RemoteItem) => ({
    kind: item.kind,
    state: item.state,
    htmlUrl: item.htmlUrl,
    assignees: item.assignees,
    remoteUpdatedAt: item.updatedAt,
    ...(item.isDraft === undefined ? {} : { isDraft: item.isDraft }),
    ...(item.headRef === undefined ? {} : { headRef: item.headRef }),
    ...(item.headSha === undefined ? {} : { headSha: item.headSha }),
    ...(item.checksStatus === undefined ? {} : { checksStatus: item.checksStatus }),
  });

  for (const item of items) {
    const current = existingByKey.get(key(item.repo, item.number));

    if (current) {
      if (current.remoteUpdatedAt && item.updatedAt <= current.remoteUpdatedAt) {
        // Same version, but checks may have arrived separately.
        if (item.checksStatus !== undefined) {
          await tx
            .update(githubItems)
            .set({ checksStatus: item.checksStatus })
            .where(eq(githubItems.cardId, current.cardId));
        }
        continue;
      }
      await tx.update(githubItems).set(mirror(item)).where(eq(githubItems.cardId, current.cardId));
      const patch: Partial<typeof cards.$inferInsert> = {
        title: item.title,
        description: item.body,
      };

      // Move only on a state transition, never on routine edits.
      const column = columnById.get(current.columnId);
      const wasClosed = isClosed(current.state);
      const nowClosed = isClosed(item.state);
      const target =
        !wasClosed && nowClosed && column && !closes(column) && done !== current.columnId
          ? done
          : wasClosed && !nowClosed && column && closes(column)
            ? inbox
            : null;
      if (target) {
        patch.columnId = target;
        patch.position = await appendPosition(target);
        result.moved += 1;
      }
      await tx.update(cards).set(patch).where(eq(cards.id, current.cardId));
      await setCardLabels(current.cardId, item);
      result.updated += 1;
      continue;
    }

    if (isClosed(item.state) || !inbox || ignoredKeys.has(key(item.repo, item.number))) continue;

    const cardId = randomUUID();
    await tx.insert(cards).values({
      id: cardId,
      boardId,
      columnId: inbox,
      position: await appendPosition(inbox),
      title: item.title,
      description: item.body,
    });
    await tx.insert(githubItems).values({
      cardId,
      boardId,
      repo: item.repo,
      number: item.number,
      ...mirror(item),
      isDraft: item.isDraft ?? false,
      headRef: item.headRef ?? null,
      headSha: item.headSha ?? null,
      checksStatus: item.checksStatus ?? null,
    });
    await setCardLabels(cardId, item);
    result.created += 1;
  }

  return result;
}

/** Checks finish separately from PR updates: patch every card on that commit. */
export async function applyChecksStatus(
  tx: Transaction,
  boardId: string,
  repo: string,
  headSha: string,
  status: RemoteItem["checksStatus"],
) {
  if (status === undefined) return 0;
  const updated = await tx
    .update(githubItems)
    .set({ checksStatus: status })
    .where(
      and(
        eq(githubItems.boardId, boardId),
        eq(githubItems.repo, repo),
        eq(githubItems.headSha, headSha),
      ),
    )
    .returning({ cardId: githubItems.cardId });
  return updated.length;
}

export async function findLinksForRepo(tx: Pick<Transaction, "select">, fullName: string) {
  const [owner, name] = fullName.split("/");
  if (!owner || !name) return [];
  return tx
    .select()
    .from(boardRepos)
    .where(
      and(
        sql`lower(${boardRepos.owner}) = ${owner.toLowerCase()}`,
        sql`lower(${boardRepos.name}) = ${name.toLowerCase()}`,
        sql`${boardRepos.authMode} <> 'demo'`,
      ),
    );
}
