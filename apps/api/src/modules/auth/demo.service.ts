import { randomBytes, randomUUID } from "node:crypto";

import {
  boardMembers,
  boardRepos,
  boards,
  cardAssignees,
  cardLabels,
  cards,
  columns,
  githubItems,
  inArray,
  labels,
  users,
  type Database,
  type Transaction,
} from "@devsync/db";
import {
  DEMO_LABELS,
  DEMO_TEAM,
  demoBoardTemplates,
  positionsBetween,
  type DemoBoardTemplate,
} from "@devsync/shared";

const DEMO_OWNER = { name: "DevSync Demo", email: "owner@demo.devsync.app" };

/** Shared, login-less accounts: the demo boards' owner and its team of assignees. */
async function ensureDemoAccounts(tx: Transaction) {
  const accounts = [DEMO_OWNER, ...DEMO_TEAM.map(({ name, email }) => ({ name, email }))];
  await tx
    .insert(users)
    .values(accounts.map((a) => ({ ...a, isGuest: true })))
    .onConflictDoNothing();
  const rows = await tx
    .select({ id: users.id, email: users.email })
    .from(users)
    .where(
      inArray(
        users.email,
        accounts.map((a) => a.email),
      ),
    );
  const idByEmail = new Map(rows.map((r) => [r.email!, r.id]));
  return {
    ownerId: idByEmail.get(DEMO_OWNER.email)!,
    teamIdByKey: new Map(DEMO_TEAM.map((m) => [m.key, idByEmail.get(m.email)!])),
  };
}

async function cloneTemplate(
  tx: Transaction,
  template: DemoBoardTemplate,
  guestId: string,
  accounts: Awaited<ReturnType<typeof ensureDemoAccounts>>,
) {
  const boardId = randomUUID();
  await tx.insert(boards).values({
    id: boardId,
    name: template.name,
    description: template.description,
    accent: template.accent,
    createdById: accounts.ownerId,
  });
  await tx.insert(boardMembers).values([
    { boardId, userId: accounts.ownerId, role: "ADMIN" },
    { boardId, userId: guestId, role: template.role },
  ]);
  if (template.repo) {
    // Sample data only: never synced or pushed.
    await tx.insert(boardRepos).values({ boardId, ...template.repo, authMode: "demo" });
  }

  const columnPositions = positionsBetween(null, null, template.columns.length);
  const columnIds = template.columns.map(() => randomUUID());
  await tx.insert(columns).values(
    template.columns.map((column, i) => ({
      id: columnIds[i]!,
      boardId,
      name: column.name,
      wipLimit: column.wipLimit,
      position: columnPositions[i]!,
    })),
  );

  const labelIdByName = new Map(DEMO_LABELS.map((l) => [l.name, randomUUID()]));
  await tx
    .insert(labels)
    .values(DEMO_LABELS.map((l) => ({ id: labelIdByName.get(l.name)!, boardId, ...l })));

  const perColumn = template.columns.map(
    (_, i) => template.cards.filter((card) => card.columnIndex === i).length,
  );
  const positionsByColumn = perColumn.map((n) => positionsBetween(null, null, n));
  const nextIndex = perColumn.map(() => 0);

  const cardRows: (typeof cards.$inferInsert)[] = [];
  const labelRows: (typeof cardLabels.$inferInsert)[] = [];
  const assigneeRows: (typeof cardAssignees.$inferInsert)[] = [];
  const githubRows: (typeof githubItems.$inferInsert)[] = [];

  for (const card of template.cards) {
    const id = randomUUID();
    const index = nextIndex[card.columnIndex]!++;
    cardRows.push({
      id,
      boardId,
      columnId: columnIds[card.columnIndex]!,
      position: positionsByColumn[card.columnIndex]![index]!,
      title: card.title,
      description: card.description,
      commentCount: card.commentCount,
      dueDate: card.dueDate ? new Date(card.dueDate) : null,
      createdById: accounts.ownerId,
      createdAt: new Date(card.createdAt),
      updatedAt: new Date(card.createdAt),
    });
    for (const label of card.labels)
      labelRows.push({ cardId: id, labelId: labelIdByName.get(label.name)! });
    for (const key of card.assignees) {
      const userId = accounts.teamIdByKey.get(key);
      if (userId) assigneeRows.push({ cardId: id, userId });
    }
    if (card.github) githubRows.push({ cardId: id, boardId, ...card.github });
  }

  await tx.insert(cards).values(cardRows);
  if (labelRows.length) await tx.insert(cardLabels).values(labelRows);
  if (assigneeRows.length) await tx.insert(cardAssignees).values(assigneeRows);
  if (githubRows.length) await tx.insert(githubItems).values(githubRows);
}

/**
 * "Try the demo": a fresh guest account with private copies of the demo
 * boards, so visitors never see each other's changes. The roles differ per
 * board (admin, maintainer, viewer) to show RBAC in action.
 */
export function createDemoSandbox(db: Database) {
  return db.transaction(async (tx) => {
    const accounts = await ensureDemoAccounts(tx);
    const [guest] = await tx
      .insert(users)
      .values({ name: `Guest ${randomBytes(2).toString("hex").toUpperCase()}`, isGuest: true })
      .returning();
    for (const template of demoBoardTemplates()) {
      await cloneTemplate(tx, template, guest!.id, accounts);
    }
    return guest!;
  });
}
