import { describe, expect, it } from "vitest";

import { applyRenameColumn, applyUpdateCard } from "../model/board-updates";
import { columnIds, idsIn, NOW, seed } from "../test-utils";
import { createBoardStore } from "./board-store";

const board = seed("mobile-app");
const [colA, colB] = columnIds(board) as [string, string];

describe("board store", () => {
  it("previews a cross-column move without touching other columns", () => {
    const store = createBoardStore(board);
    const before = store.getState();
    const moving = idsIn(board, colA)[0]!;

    store.getState().actions.startDrag("card", moving);
    store.getState().actions.previewCardMove(moving, colB, 1);

    const after = store.getState();
    expect(after.columns[colB]?.cardIds[1]).toBe(moving);
    expect(after.columns[colA]?.cardIds).not.toContain(moving);
    const untouched = columnIds(board).slice(2);
    for (const id of untouched) expect(after.columns[id]).toBe(before.columns[id]);
    expect(after.cards).toBe(before.cards);
  });

  it("records where a drag started", () => {
    const store = createBoardStore(board);
    const second = idsIn(board, colA)[1]!;
    store.getState().actions.startDrag("card", second);
    expect(store.getState().activeDrag).toMatchObject({
      kind: "card",
      originColumnId: colA,
      originIndex: 1,
    });
  });

  it("defers server syncs during a drag and restores on cancel", () => {
    const store = createBoardStore(board);
    const moving = idsIn(board, colA)[0]!;
    store.getState().actions.startDrag("card", moving);
    store.getState().actions.previewCardMove(moving, colB, 0);

    const renamed = applyRenameColumn(board, {
      boardId: board.id,
      columnId: colB,
      name: "Doing now",
    });
    store.getState().actions.sync(renamed);
    // Not applied mid-drag: the preview must stay under the pointer.
    expect(store.getState().columns[colB]?.name).not.toBe("Doing now");

    store.getState().actions.endDrag(false);
    const state = store.getState();
    expect(state.columns[colB]?.name).toBe("Doing now");
    expect(state.columns[colA]?.cardIds).toEqual(idsIn(board, colA));
    expect(state.activeDrag).toBeNull();
  });

  it("keeps the dropped order on a committed drop until the cache catches up", () => {
    const store = createBoardStore(board);
    const moving = idsIn(board, colA)[0]!;
    store.getState().actions.startDrag("card", moving);
    store.getState().actions.previewCardMove(moving, colB, 0);
    store.getState().actions.endDrag(true);
    expect(store.getState().columns[colB]?.cardIds[0]).toBe(moving);

    // A failed write resyncs to the last known server state.
    store.getState().actions.resync();
    expect(store.getState().columns[colA]?.cardIds[0]).toBe(moving);
  });

  it("syncs card edits without replacing columns", () => {
    const store = createBoardStore(board);
    const before = store.getState();
    const id = board.cards[0]!.id;
    store
      .getState()
      .actions.sync(applyUpdateCard(board, { boardId: board.id, cardId: id, title: "x" }, NOW));
    expect(store.getState().columns).toBe(before.columns);
    expect(store.getState().cards[id]?.title).toBe("x");
  });

  it("resets transient UI", () => {
    const store = createBoardStore(board);
    store.getState().actions.openCard(board.cards[0]!.id);
    store.getState().actions.setPanel("analytics");
    store.getState().actions.resetTransientUi();
    expect(store.getState()).toMatchObject({ openCardId: null, panel: null });
  });
});
