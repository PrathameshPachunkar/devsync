import { and, columns, eq, ne, type Database, type Transaction } from "@devsync/db";
import { OrderingConflictError, placeAmong, type ColumnDto } from "@devsync/shared";

import { withBoardWrite, type Mutated } from "../../lib/board-write";
import { conflict, notFound } from "../../lib/http-error";
import { rebalanceColumnsIfNeeded } from "../../lib/rebalance";
import { toColumnDto } from "./board-dto";

async function requireColumn(tx: Transaction, boardId: string, columnId: string) {
  const [row] = await tx
    .select()
    .from(columns)
    .where(and(eq(columns.id, columnId), eq(columns.boardId, boardId)));
  if (!row) throw notFound("column_not_found", "Column not found");
  return row;
}

export function place<T extends { id: string; position: string }>(
  siblings: T[],
  prevId: string | null,
  nextId: string | null,
) {
  try {
    return placeAmong(siblings, prevId, nextId);
  } catch (error) {
    if (error instanceof OrderingConflictError) throw conflict("stale_position", error.message);
    throw error;
  }
}

export function createColumn(
  db: Database,
  boardId: string,
  input: { id?: string | undefined; name: string },
): Promise<Mutated<ColumnDto>> {
  return withBoardWrite(db, boardId, async (tx) => {
    if (input.id) {
      // Idempotent retry of an optimistic create.
      const [existing] = await tx.select().from(columns).where(eq(columns.id, input.id));
      if (existing?.boardId === boardId) return toColumnDto(existing);
      if (existing) throw conflict("id_taken", "That id is already in use");
    }
    const siblings = await tx
      .select({ id: columns.id, position: columns.position })
      .from(columns)
      .where(eq(columns.boardId, boardId));
    const [row] = await tx
      .insert(columns)
      .values({
        ...(input.id ? { id: input.id } : {}),
        boardId,
        name: input.name,
        position: place(siblings, null, null),
      })
      .returning();
    return toColumnDto(row!);
  });
}

export function renameColumn(
  db: Database,
  boardId: string,
  columnId: string,
  name: string,
): Promise<Mutated<ColumnDto>> {
  return withBoardWrite(db, boardId, async (tx) => {
    const [row] = await tx
      .update(columns)
      .set({ name })
      .where(and(eq(columns.id, columnId), eq(columns.boardId, boardId)))
      .returning();
    if (!row) throw notFound("column_not_found", "Column not found");
    return toColumnDto(row);
  });
}

export function moveColumn(
  db: Database,
  boardId: string,
  columnId: string,
  input: { prevColumnId: string | null; nextColumnId: string | null },
): Promise<Mutated<ColumnDto>> {
  return withBoardWrite(db, boardId, async (tx) => {
    await requireColumn(tx, boardId, columnId);
    const siblings = await tx
      .select({ id: columns.id, position: columns.position })
      .from(columns)
      .where(and(eq(columns.boardId, boardId), ne(columns.id, columnId)));
    const position = place(siblings, input.prevColumnId, input.nextColumnId);
    await tx.update(columns).set({ position }).where(eq(columns.id, columnId));
    await rebalanceColumnsIfNeeded(tx, boardId, position);
    return toColumnDto(await requireColumn(tx, boardId, columnId));
  });
}

export function deleteColumn(
  db: Database,
  boardId: string,
  columnId: string,
): Promise<Mutated<null>> {
  return withBoardWrite(db, boardId, async (tx) => {
    const deleted = await tx
      .delete(columns)
      .where(and(eq(columns.id, columnId), eq(columns.boardId, boardId)))
      .returning({ id: columns.id });
    if (deleted.length === 0) throw notFound("column_not_found", "Column not found");
    return null;
  });
}
