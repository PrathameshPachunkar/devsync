import type { BoardDto } from "@devsync/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStore, useStore } from "zustand";

import { BoardApiProvider } from "../api/board-api";
import { createMockBoardApi } from "../api/mock-board-api";
import { applyMoveCard, applyUpdateCard } from "../model/board-updates";
import { BoardStoreProvider } from "../store/board-store";
import { columnIds, idsIn, NOW, seed } from "../test-utils";
import { BoardCanvas } from "./board-canvas";

/**
 * Memoization regression tests on the 120-card board. They count real
 * renders, so a change that breaks structural sharing or memo boundaries
 * fails here instead of becoming a dropped frame in production.
 */

// Stands in for the query cache: tests push new board snapshots into it.
const cache = createStore<{ board: BoardDto | null }>(() => ({ board: null }));
const setBoard = (board: BoardDto) => cache.setState({ board });

function Harness({ initial }: { initial: BoardDto }) {
  const [client] = useState(() => new QueryClient());
  const [api] = useState(() => createMockBoardApi({ latencyMs: [0, 0], storage: null }));
  const board = useStore(cache, (state) => state.board) ?? initial;
  return (
    <QueryClientProvider client={client}>
      <BoardApiProvider value={api}>
        <BoardStoreProvider board={board}>
          <BoardCanvas />
        </BoardStoreProvider>
      </BoardApiProvider>
    </QueryClientProvider>
  );
}

const counts = () => globalThis.__DEVSYNC_RENDER_COUNTS__!;
const count = (name: string) => counts().get(name) ?? 0;

beforeEach(() => {
  cache.setState({ board: null });
  globalThis.__DEVSYNC_RENDER_COUNTS__ = new Map();
});
afterEach(() => {
  globalThis.__DEVSYNC_RENDER_COUNTS__ = undefined;
});

describe("board rendering", () => {
  const board = seed();
  const [colA, colB] = columnIds(board) as [string, string];

  it("renders all 120 cards once on mount", () => {
    render(<Harness initial={board} />);
    expect(screen.getAllByTestId("task-card")).toHaveLength(120);
    expect(count("TaskCardBody")).toBe(120);
    expect(count("ColumnCardList")).toBe(4);
  });

  it("re-renders exactly one card body when one card changes", () => {
    render(<Harness initial={board} />);
    counts().clear();

    const id = idsIn(board, colB)[3]!;
    act(() =>
      setBoard(applyUpdateCard(board, { boardId: board.id, cardId: id, title: "Edited" }, NOW)),
    );

    expect(screen.getByText("Edited")).toBeInTheDocument();
    expect(count("TaskCardBody")).toBe(1);
    expect(count("ColumnCardList")).toBe(0);
    expect(count("BoardCanvas")).toBe(0);
  });

  it("re-renders only the two affected columns when a card moves", () => {
    render(<Harness initial={board} />);
    counts().clear();

    const moving = idsIn(board, colA)[0]!;
    act(() =>
      setBoard(
        applyMoveCard(
          board,
          {
            boardId: board.id,
            cardId: moving,
            toColumnId: colB,
            prevCardId: null,
            nextCardId: null,
          },
          NOW,
        ),
      ),
    );

    expect(count("ColumnCardList")).toBe(2);
    // Only the moved card mounts in its new column. 119 bodies stay put.
    expect(count("TaskCardBody")).toBe(1);
    expect(count("BoardCanvas")).toBe(0);
  });
});
