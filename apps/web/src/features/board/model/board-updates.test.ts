import { describe, expect, it } from "vitest";

import { columnIds, idsIn, NOW, seed } from "../test-utils";
import {
  applyCreateCard,
  applyCreateColumn,
  applyDeleteColumn,
  applyMoveCard,
  applyMoveColumn,
  applyRenameColumn,
  applyUpdateCard,
  BoardUpdateError,
} from "./board-updates";

const board = seed("marketing-site");
const [colA, colB, colC] = columnIds(board) as [string, string, string];

describe("applyMoveCard", () => {
  it("moves a card between two neighbors in another column", () => {
    const [moving] = idsIn(board, colA) as [string];
    const [first, second] = idsIn(board, colB) as [string, string];

    const next = applyMoveCard(
      board,
      {
        boardId: board.id,
        cardId: moving,
        toColumnId: colB,
        prevCardId: first,
        nextCardId: second,
      },
      NOW,
    );

    expect(idsIn(next, colB).slice(0, 3)).toEqual([first, moving, second]);
    expect(idsIn(next, colA)).not.toContain(moving);
    expect(next.version).toBe(board.version + 1);
  });

  it("reuses every untouched card object (structural sharing)", () => {
    const [moving] = idsIn(board, colA) as [string];
    const next = applyMoveCard(
      board,
      { boardId: board.id, cardId: moving, toColumnId: colC, prevCardId: null, nextCardId: null },
      NOW,
    );
    const untouched = next.cards.filter((c) => c.id !== moving);
    expect(untouched.every((c) => board.cards.includes(c))).toBe(true);
  });

  it("anchors on prev and ignores a stale next", () => {
    const ids = idsIn(board, colB);
    const moving = idsIn(board, colA)[0]!;
    // Client thinks next is the last card. Server trusts the prev anchor.
    const next = applyMoveCard(
      board,
      {
        boardId: board.id,
        cardId: moving,
        toColumnId: colB,
        prevCardId: ids[0]!,
        nextCardId: ids.at(-1)!,
      },
      NOW,
    );
    expect(idsIn(next, colB)[1]).toBe(moving);
  });

  it("appends to an empty column", () => {
    const emptied = applyCreateColumn(board, { boardId: board.id, columnId: "new", name: "QA" });
    const moving = idsIn(board, colA)[0]!;
    const next = applyMoveCard(
      emptied,
      { boardId: board.id, cardId: moving, toColumnId: "new", prevCardId: null, nextCardId: null },
      NOW,
    );
    expect(idsIn(next, "new")).toEqual([moving]);
  });

  it("raises a conflict when the anchor card is gone", () => {
    const moving = idsIn(board, colA)[0]!;
    expect(() =>
      applyMoveCard(
        board,
        {
          boardId: board.id,
          cardId: moving,
          toColumnId: colB,
          prevCardId: "ghost",
          nextCardId: null,
        },
        NOW,
      ),
    ).toThrow(BoardUpdateError);
  });
});

describe("column transitions", () => {
  it("creates columns at the end and is idempotent on retry", () => {
    const input = { boardId: board.id, columnId: "col-new", name: "  Blocked   items " };
    const once = applyCreateColumn(board, input);
    expect(columnIds(once).at(-1)).toBe("col-new");
    expect(once.columns.find((c) => c.id === "col-new")?.name).toBe("Blocked items");
    expect(applyCreateColumn(once, input)).toBe(once);
  });

  it("reorders a column to the front", () => {
    const next = applyMoveColumn(board, {
      boardId: board.id,
      columnId: colC,
      prevColumnId: null,
      nextColumnId: colA,
    });
    expect(columnIds(next)).toEqual([colC, colA, colB]);
  });

  it("renames, rejecting empty names and skipping no-ops", () => {
    expect(() =>
      applyRenameColumn(board, { boardId: board.id, columnId: colA, name: "   " }),
    ).toThrow(BoardUpdateError);
    const name = board.columns.find((c) => c.id === colA)!.name;
    expect(applyRenameColumn(board, { boardId: board.id, columnId: colA, name })).toBe(board);
  });

  it("cascades card deletion with its column", () => {
    const next = applyDeleteColumn(board, { boardId: board.id, columnId: colA });
    expect(next.columns.map((c) => c.id)).not.toContain(colA);
    expect(next.cards.some((c) => c.columnId === colA)).toBe(false);
    expect(next.cards).toHaveLength(board.cards.length - idsIn(board, colA).length);
  });
});

describe("card transitions", () => {
  it("creates cards at the bottom of a column", () => {
    const next = applyCreateCard(
      board,
      { boardId: board.id, cardId: "card-new", columnId: colB, title: "Ship it" },
      NOW,
    );
    expect(idsIn(next, colB).at(-1)).toBe("card-new");
  });

  it("updates text and clears blank descriptions", () => {
    const id = board.cards[0]!.id;
    const next = applyUpdateCard(
      board,
      { boardId: board.id, cardId: id, title: "Renamed", description: "   " },
      NOW,
    );
    const card = next.cards.find((c) => c.id === id)!;
    expect(card.title).toBe("Renamed");
    expect(card.description).toBeNull();
    expect(card.updatedAt).toBe(NOW);
  });
});
