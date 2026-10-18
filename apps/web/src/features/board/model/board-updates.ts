import {
  byPosition,
  CARD_TITLE_MAX_LENGTH,
  COLUMN_NAME_MAX_LENGTH,
  positionBetween,
  type BoardDto,
  type CardDto,
  type ColumnDto,
  type CreateCardInput,
  type CreateColumnInput,
  type DeleteCardInput,
  type DeleteColumnInput,
  type MoveCardInput,
  type MoveColumnInput,
  type RenameColumnInput,
  type UpdateCardInput,
} from "@devsync/shared";

/**
 * Pure, immutable board transitions. The optimistic client cache and the mock
 * server both use them, so a drop lands in the same place on both sides.
 *
 * Every function returns a new BoardDto and reuses the objects it did not
 * touch. That structural sharing is what lets memoized cards skip
 * re-rendering.
 */

export class BoardUpdateError extends Error {
  constructor(
    message: string,
    readonly code: "not_found" | "conflict" | "invalid",
  ) {
    super(message);
    this.name = "BoardUpdateError";
  }
}

function bump(board: BoardDto, patch: Partial<Pick<BoardDto, "columns" | "cards">>): BoardDto {
  return { ...board, ...patch, version: board.version + 1 };
}

function requireColumn(board: BoardDto, columnId: string): ColumnDto {
  const column = board.columns.find((c) => c.id === columnId);
  if (!column) throw new BoardUpdateError(`Column ${columnId} not found`, "not_found");
  return column;
}

function requireCard(board: BoardDto, cardId: string): CardDto {
  const card = board.cards.find((c) => c.id === cardId);
  if (!card) throw new BoardUpdateError(`Card ${cardId} not found`, "not_found");
  return card;
}

function cleanName(name: string, max: number): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new BoardUpdateError("Name cannot be empty", "invalid");
  return trimmed.slice(0, max);
}

/**
 * Position for an item placed between neighbor ids in an ordered sibling
 * list that excludes the moved item. The server trusts the anchor, not the
 * pair: with `prevId` the item goes right after prev, otherwise right before
 * `nextId`, otherwise at the end. A stale client therefore cannot produce
 * an invalid range.
 */
function placeAmong<T extends { id: string; position: string }>(
  siblings: readonly T[],
  prevId: string | null,
  nextId: string | null,
): string {
  const sorted = [...siblings].sort(byPosition);

  if (prevId !== null) {
    const index = sorted.findIndex((s) => s.id === prevId);
    if (index === -1) throw new BoardUpdateError("Drop target moved. Refreshing", "conflict");
    return positionBetween(sorted[index]!.position, sorted[index + 1]?.position ?? null);
  }
  if (nextId !== null) {
    const index = sorted.findIndex((s) => s.id === nextId);
    if (index === -1) throw new BoardUpdateError("Drop target moved. Refreshing", "conflict");
    return positionBetween(sorted[index - 1]?.position ?? null, sorted[index]!.position);
  }
  return positionBetween(sorted.at(-1)?.position ?? null, null);
}

/* ---------------------------------------------------------------- columns */

export function applyCreateColumn(board: BoardDto, input: CreateColumnInput): BoardDto {
  if (board.columns.some((c) => c.id === input.columnId)) return board; // idempotent retry
  const column: ColumnDto = {
    id: input.columnId,
    boardId: board.id,
    name: cleanName(input.name, COLUMN_NAME_MAX_LENGTH),
    position: placeAmong(board.columns, null, null),
    wipLimit: null,
  };
  return bump(board, { columns: [...board.columns, column] });
}

export function applyRenameColumn(board: BoardDto, input: RenameColumnInput): BoardDto {
  const column = requireColumn(board, input.columnId);
  const name = cleanName(input.name, COLUMN_NAME_MAX_LENGTH);
  if (name === column.name) return board;
  return bump(board, {
    columns: board.columns.map((c) => (c.id === column.id ? { ...c, name } : c)),
  });
}

export function applyMoveColumn(board: BoardDto, input: MoveColumnInput): BoardDto {
  const column = requireColumn(board, input.columnId);
  const siblings = board.columns.filter((c) => c.id !== column.id);
  const position = placeAmong(siblings, input.prevColumnId, input.nextColumnId);
  return bump(board, {
    columns: board.columns.map((c) => (c.id === column.id ? { ...c, position } : c)),
  });
}

export function applyDeleteColumn(board: BoardDto, input: DeleteColumnInput): BoardDto {
  requireColumn(board, input.columnId);
  return bump(board, {
    columns: board.columns.filter((c) => c.id !== input.columnId),
    // Mirrors ON DELETE CASCADE in the schema.
    cards: board.cards.filter((card) => card.columnId !== input.columnId),
  });
}

/* ------------------------------------------------------------------ cards */

export function applyCreateCard(board: BoardDto, input: CreateCardInput, now: string): BoardDto {
  if (board.cards.some((c) => c.id === input.cardId)) return board; // idempotent retry
  requireColumn(board, input.columnId);
  const siblings = board.cards.filter((c) => c.columnId === input.columnId);
  const card: CardDto = {
    id: input.cardId,
    boardId: board.id,
    columnId: input.columnId,
    position: placeAmong(siblings, null, null),
    title: cleanName(input.title, CARD_TITLE_MAX_LENGTH),
    description: null,
    labels: [],
    assignees: [],
    commentCount: 0,
    dueDate: null,
    github: null,
    createdAt: now,
    updatedAt: now,
  };
  return bump(board, { cards: [...board.cards, card] });
}

export function applyMoveCard(board: BoardDto, input: MoveCardInput, now: string): BoardDto {
  const card = requireCard(board, input.cardId);
  requireColumn(board, input.toColumnId);
  const siblings = board.cards.filter((c) => c.columnId === input.toColumnId && c.id !== card.id);
  const position = placeAmong(siblings, input.prevCardId, input.nextCardId);
  return bump(board, {
    cards: board.cards.map((c) =>
      c.id === card.id ? { ...c, columnId: input.toColumnId, position, updatedAt: now } : c,
    ),
  });
}

export function applyUpdateCard(board: BoardDto, input: UpdateCardInput, now: string): BoardDto {
  const card = requireCard(board, input.cardId);
  const title =
    input.title === undefined ? card.title : cleanName(input.title, CARD_TITLE_MAX_LENGTH);
  const description =
    input.description === undefined ? card.description : input.description?.trim() || null;
  if (title === card.title && description === card.description) return board;
  return bump(board, {
    cards: board.cards.map((c) =>
      c.id === card.id ? { ...c, title, description, updatedAt: now } : c,
    ),
  });
}

export function applyDeleteCard(board: BoardDto, input: DeleteCardInput): BoardDto {
  requireCard(board, input.cardId);
  return bump(board, { cards: board.cards.filter((c) => c.id !== input.cardId) });
}
