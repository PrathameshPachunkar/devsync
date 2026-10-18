import { randomUUID } from "node:crypto";

import {
  boardMembers,
  boardRepos,
  boards,
  cards,
  columns,
  count,
  eq,
  inArray,
  type Database,
  type DbOrTx,
} from "@devsync/db";
import {
  byPosition,
  positionsBetween,
  type BoardRole,
  type BoardSummaryDto,
  type CreateBoardBody,
  type UpdateBoardBody,
} from "@devsync/shared";

import { withBoardWrite, type Mutated } from "../../lib/board-write";
import { notFound } from "../../lib/http-error";

export const DEFAULT_COLUMNS = ["To do", "In progress", "Done"] as const;

/** Every board the user belongs to, with the counts the board list shows. */
export async function listBoardSummaries(db: DbOrTx, userId: string): Promise<BoardSummaryDto[]> {
  const memberships = await db
    .select({ board: boards, role: boardMembers.role })
    .from(boardMembers)
    .innerJoin(boards, eq(boards.id, boardMembers.boardId))
    .where(eq(boardMembers.userId, userId))
    .orderBy(boards.createdAt);
  if (memberships.length === 0) return [];

  const boardIds = memberships.map((m) => m.board.id);
  const [columnRows, cardCounts, memberCounts, repoRows] = await Promise.all([
    db
      .select({ id: columns.id, boardId: columns.boardId, position: columns.position })
      .from(columns)
      .where(inArray(columns.boardId, boardIds)),
    db
      .select({ columnId: cards.columnId, total: count() })
      .from(cards)
      .where(inArray(cards.boardId, boardIds))
      .groupBy(cards.columnId),
    db
      .select({ boardId: boardMembers.boardId, total: count() })
      .from(boardMembers)
      .where(inArray(boardMembers.boardId, boardIds))
      .groupBy(boardMembers.boardId),
    db.select().from(boardRepos).where(inArray(boardRepos.boardId, boardIds)),
  ]);

  const cardsByColumn = new Map(cardCounts.map((r) => [r.columnId, Number(r.total)]));
  const membersByBoard = new Map(memberCounts.map((r) => [r.boardId, Number(r.total)]));
  const repoByBoard = new Map(repoRows.map((r) => [r.boardId, r]));

  return memberships.map(({ board, role }) => {
    const boardColumns = columnRows.filter((c) => c.boardId === board.id).sort(byPosition);
    const lastColumnId = boardColumns.at(-1)?.id;
    const openCardCount = boardColumns
      .filter((c) => c.id !== lastColumnId)
      .reduce((sum, c) => sum + (cardsByColumn.get(c.id) ?? 0), 0);
    const repo = repoByBoard.get(board.id);
    return {
      id: board.id,
      name: board.name,
      description: board.description,
      accent: board.accent ?? null,
      repo: repo ? { owner: repo.owner, name: repo.name } : null,
      role,
      columnCount: boardColumns.length,
      openCardCount,
      memberCount: membersByBoard.get(board.id) ?? 0,
    };
  });
}

/** Creates a board with default columns. The creator becomes its admin. */
export async function createBoard(
  db: Database,
  userId: string,
  input: CreateBoardBody,
  role: BoardRole = "ADMIN",
): Promise<BoardSummaryDto> {
  const boardId = randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(boards).values({
      id: boardId,
      name: input.name,
      description: input.description,
      accent: input.accent,
      createdById: userId,
    });
    await tx.insert(boardMembers).values({ boardId, userId, role });
    const positions = positionsBetween(null, null, DEFAULT_COLUMNS.length);
    await tx
      .insert(columns)
      .values(DEFAULT_COLUMNS.map((name, i) => ({ boardId, name, position: positions[i]! })));
  });
  const summary = (await listBoardSummaries(db, userId)).find((b) => b.id === boardId);
  return summary!;
}

export async function updateBoard(
  db: Database,
  userId: string,
  boardId: string,
  input: UpdateBoardBody,
): Promise<Mutated<BoardSummaryDto>> {
  const { version } = await withBoardWrite(db, boardId, async (tx) => {
    await tx.update(boards).set(input).where(eq(boards.id, boardId));
  });
  const summary = (await listBoardSummaries(db, userId)).find((b) => b.id === boardId);
  if (!summary) throw notFound("board_not_found", "Board not found");
  return { data: summary, version };
}

export async function deleteBoard(db: Database, boardId: string): Promise<void> {
  const deleted = await db
    .delete(boards)
    .where(eq(boards.id, boardId))
    .returning({ id: boards.id });
  if (deleted.length === 0) throw notFound("board_not_found", "Board not found");
}
