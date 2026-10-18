import { and, cards, columns, eq, ne, type Database, type Transaction } from "@devsync/db";
import type { CardDto } from "@devsync/shared";

import { withBoardWrite, type Mutated } from "../../lib/board-write";
import { conflict, notFound } from "../../lib/http-error";
import { rebalanceCardsIfNeeded } from "../../lib/rebalance";
import { loadCardDto } from "./board-dto";
import { place } from "./columns.service";

async function requireColumnInBoard(tx: Transaction, boardId: string, columnId: string) {
  const [row] = await tx
    .select({ id: columns.id })
    .from(columns)
    .where(and(eq(columns.id, columnId), eq(columns.boardId, boardId)));
  if (!row) throw notFound("column_not_found", "Column not found");
}

async function requireCardInBoard(tx: Transaction, boardId: string, cardId: string) {
  const [row] = await tx
    .select({ id: cards.id })
    .from(cards)
    .where(and(eq(cards.id, cardId), eq(cards.boardId, boardId)));
  if (!row) throw notFound("card_not_found", "Card not found");
}

export function createCard(
  db: Database,
  boardId: string,
  userId: string,
  input: { id?: string | undefined; columnId: string; title: string },
): Promise<Mutated<CardDto>> {
  return withBoardWrite(db, boardId, async (tx) => {
    if (input.id) {
      const [existing] = await tx.select().from(cards).where(eq(cards.id, input.id));
      if (existing?.boardId === boardId) return loadCardDto(tx, existing.id);
      if (existing) throw conflict("id_taken", "That id is already in use");
    }
    await requireColumnInBoard(tx, boardId, input.columnId);
    const siblings = await tx
      .select({ id: cards.id, position: cards.position })
      .from(cards)
      .where(eq(cards.columnId, input.columnId));
    const [row] = await tx
      .insert(cards)
      .values({
        ...(input.id ? { id: input.id } : {}),
        boardId,
        columnId: input.columnId,
        title: input.title,
        position: place(siblings, null, null),
        createdById: userId,
      })
      .returning({ id: cards.id });
    return loadCardDto(tx, row!.id);
  });
}

export function updateCard(
  db: Database,
  boardId: string,
  cardId: string,
  input: { title?: string | undefined; description?: string | null | undefined },
): Promise<Mutated<CardDto>> {
  return withBoardWrite(db, boardId, async (tx) => {
    const patch: Partial<typeof cards.$inferInsert> = {};
    if (input.title !== undefined) patch.title = input.title;
    if (input.description !== undefined) patch.description = input.description?.trim() || null;
    const updated = await tx
      .update(cards)
      .set(patch)
      .where(and(eq(cards.id, cardId), eq(cards.boardId, boardId)))
      .returning({ id: cards.id });
    if (updated.length === 0) throw notFound("card_not_found", "Card not found");
    return loadCardDto(tx, cardId);
  });
}

/**
 * Moves a card next to neighbor ids. The key is computed here from the
 * database's view of those neighbors, never taken from the client, under the
 * board lock that withBoardWrite holds.
 */
export function moveCard(
  db: Database,
  boardId: string,
  cardId: string,
  input: { toColumnId: string; prevCardId: string | null; nextCardId: string | null },
): Promise<Mutated<CardDto>> {
  return withBoardWrite(db, boardId, async (tx) => {
    await requireCardInBoard(tx, boardId, cardId);
    await requireColumnInBoard(tx, boardId, input.toColumnId);
    const siblings = await tx
      .select({ id: cards.id, position: cards.position })
      .from(cards)
      .where(and(eq(cards.columnId, input.toColumnId), ne(cards.id, cardId)));
    const position = place(siblings, input.prevCardId, input.nextCardId);
    await tx
      .update(cards)
      .set({ columnId: input.toColumnId, position })
      .where(eq(cards.id, cardId));
    await rebalanceCardsIfNeeded(tx, input.toColumnId, position);
    return loadCardDto(tx, cardId);
  });
}

export function deleteCard(db: Database, boardId: string, cardId: string): Promise<Mutated<null>> {
  return withBoardWrite(db, boardId, async (tx) => {
    const deleted = await tx
      .delete(cards)
      .where(and(eq(cards.id, cardId), eq(cards.boardId, boardId)))
      .returning({ id: cards.id });
    if (deleted.length === 0) throw notFound("card_not_found", "Card not found");
    return null;
  });
}
