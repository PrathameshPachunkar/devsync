import { describe, expect, it } from "vitest";

import { columnIds, idsIn, NOW, seed } from "../test-utils";
import { applyMoveCard, applyRenameColumn, applyUpdateCard } from "./board-updates";
import { findColumnOfCard, normalizeBoard } from "./normalize";

const board = seed();
const [colA, colB, colC] = columnIds(board) as [string, string, string];

describe("normalizeBoard", () => {
  it("orders columns and cards by position", () => {
    const view = normalizeBoard(board);
    expect(view.columnOrder).toEqual(columnIds(board));
    expect(view.columns[colA]?.cardIds).toEqual(idsIn(board, colA));
    expect(Object.keys(view.cards)).toHaveLength(board.cards.length);
  });

  it("returns the identical view when nothing changed", () => {
    const view = normalizeBoard(board);
    const again = normalizeBoard(structuredClone(board), view);
    // Different card objects (a refetch), so the cards map changes...
    expect(again.cards).not.toBe(view.cards);
    // ...but columns and order are structurally equal and reused.
    expect(again.columns).toBe(view.columns);
    expect(again.columnOrder).toBe(view.columnOrder);
  });

  it("only replaces the columns touched by a move", () => {
    const view = normalizeBoard(board);
    const moving = idsIn(board, colA)[0]!;
    const next = applyMoveCard(
      board,
      { boardId: board.id, cardId: moving, toColumnId: colB, prevCardId: null, nextCardId: null },
      NOW,
    );
    const nextView = normalizeBoard(next, view);

    expect(nextView.columns[colA]).not.toBe(view.columns[colA]);
    expect(nextView.columns[colB]).not.toBe(view.columns[colB]);
    expect(nextView.columns[colC]).toBe(view.columns[colC]);
    expect(nextView.columnOrder).toBe(view.columnOrder);
    expect(findColumnOfCard(nextView, moving)).toBe(colB);
  });

  it("keeps every column when a single card's text changes", () => {
    const view = normalizeBoard(board);
    const id = board.cards[5]!.id;
    const nextView = normalizeBoard(
      applyUpdateCard(board, { boardId: board.id, cardId: id, title: "Edited" }, NOW),
      view,
    );
    expect(nextView.columns).toBe(view.columns);
    expect(nextView.cards[id]).not.toBe(view.cards[id]);
    const other = board.cards[6]!.id;
    expect(nextView.cards[other]).toBe(view.cards[other]);
  });

  it("replaces a renamed column but keeps its card id array", () => {
    const view = normalizeBoard(board);
    const nextView = normalizeBoard(
      applyRenameColumn(board, { boardId: board.id, columnId: colA, name: "Inbox" }),
      view,
    );
    expect(nextView.columns[colA]?.name).toBe("Inbox");
    expect(nextView.columns[colA]?.cardIds).toBe(view.columns[colA]?.cardIds);
  });
});
