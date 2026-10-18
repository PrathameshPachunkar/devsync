import { byPosition, type BoardDto, type CardDto, type ColumnDto } from "@devsync/shared";

/**
 * View model for rendering and drag-and-drop. Columns hold ordered card ids
 * and cards live in a flat map. A card component subscribes to
 * `cards[id]` and a column to `columns[id]`, so a change re-renders only
 * the components whose slice actually changed.
 */
export interface ColumnView extends ColumnDto {
  readonly cardIds: readonly string[];
}

export interface BoardView {
  readonly columnOrder: readonly string[];
  readonly columns: Readonly<Record<string, ColumnView>>;
  readonly cards: Readonly<Record<string, CardDto>>;
}

export const EMPTY_BOARD_VIEW: BoardView = { columnOrder: [], columns: {}, cards: {} };

export function shallowEqualArrays<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (a[i] !== b[i]) return false;
  return true;
}

function sameColumnFields(a: ColumnDto, b: ColumnDto): boolean {
  return (
    a.id === b.id &&
    a.boardId === b.boardId &&
    a.name === b.name &&
    a.position === b.position &&
    a.wipLimit === b.wipLimit
  );
}

/**
 * Converts a BoardDto into a BoardView, reusing every object from `previous`
 * that is unchanged. Without this, each server sync or optimistic update
 * would hand every column a new object and re-render the whole board.
 */
export function normalizeBoard(board: BoardDto, previous: BoardView = EMPTY_BOARD_VIEW): BoardView {
  const sortedColumns = [...board.columns].sort(byPosition);
  const cardIdsByColumn = new Map<string, CardDto[]>(sortedColumns.map((c) => [c.id, []]));

  let cardsChanged = Object.keys(previous.cards).length !== board.cards.length;
  const cards: Record<string, CardDto> = {};
  for (const card of board.cards) {
    cards[card.id] = card;
    if (previous.cards[card.id] !== card) cardsChanged = true;
    cardIdsByColumn.get(card.columnId)?.push(card);
  }

  const columns: Record<string, ColumnView> = {};
  let columnsChanged = Object.keys(previous.columns).length !== sortedColumns.length;
  for (const column of sortedColumns) {
    const cardIds = (cardIdsByColumn.get(column.id) ?? []).sort(byPosition).map((c) => c.id);
    const prev = previous.columns[column.id];
    if (prev && sameColumnFields(prev, column) && shallowEqualArrays(prev.cardIds, cardIds)) {
      columns[column.id] = prev;
    } else {
      columns[column.id] = {
        ...column,
        cardIds: prev && shallowEqualArrays(prev.cardIds, cardIds) ? prev.cardIds : cardIds,
      };
      columnsChanged = true;
    }
  }

  const columnOrder = sortedColumns.map((c) => c.id);

  return {
    columnOrder: shallowEqualArrays(previous.columnOrder, columnOrder)
      ? previous.columnOrder
      : columnOrder,
    columns: columnsChanged ? columns : previous.columns,
    cards: cardsChanged ? cards : previous.cards,
  };
}

export function findColumnOfCard(view: BoardView, cardId: string): string | undefined {
  for (const columnId of view.columnOrder) {
    if (view.columns[columnId]?.cardIds.includes(cardId)) return columnId;
  }
  return undefined;
}
