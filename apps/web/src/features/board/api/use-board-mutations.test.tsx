import type { BoardDto } from "@devsync/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { columnIds, idsIn, seed } from "../test-utils";
import { BoardApiProvider, type BoardApi } from "./board-api";
import { boardKeys } from "./board-queries";
import { createMockBoardApi } from "./mock-board-api";
import { useMoveCard, useRenameColumn } from "./use-board-mutations";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

function setup(api: BoardApi) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const board = seed("marketing-site");
  client.setQueryData(boardKeys.detail(board.id), board);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <BoardApiProvider value={api}>{children}</BoardApiProvider>
    </QueryClientProvider>
  );
  const read = () => client.getQueryData<BoardDto>(boardKeys.detail(board.id))!;
  return { client, board, wrapper, read };
}

describe("optimistic board mutations", () => {
  it("applies the change before the server responds", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const base = createMockBoardApi({ latencyMs: [0, 0], storage: null });
    const api: BoardApi = {
      ...base,
      renameColumn: async (i) => (await gate, base.renameColumn(i)),
    };
    const { board, wrapper, read } = setup(api);
    const columnId = columnIds(board)[0]!;

    const { result } = renderHook(() => useRenameColumn(), { wrapper });
    act(() => result.current.mutate({ boardId: board.id, columnId, name: "Optimistic" }));

    await waitFor(() =>
      expect(read().columns.find((c) => c.id === columnId)?.name).toBe("Optimistic"),
    );
    expect(result.current.isPending).toBe(true);
    release();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it("rolls back when the server rejects the move", async () => {
    let fail!: () => void;
    const gate = new Promise<void>((resolve) => (fail = resolve));
    const base = createMockBoardApi({ latencyMs: [0, 0], storage: null });
    const api: BoardApi = {
      ...base,
      moveCard: async () => {
        await gate;
        throw new Error("Network error");
      },
    };
    const { board, wrapper, read } = setup(api);
    const [colA, colB] = columnIds(board) as [string, string];
    const moving = idsIn(board, colA)[0]!;

    const { result } = renderHook(() => useMoveCard(), { wrapper });
    act(() =>
      result.current.mutate({
        boardId: board.id,
        cardId: moving,
        toColumnId: colB,
        prevCardId: null,
        nextCardId: null,
      }),
    );

    await waitFor(() => expect(idsIn(read(), colB)).toContain(moving));
    fail();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(idsIn(read(), colA)).toEqual(idsIn(board, colA));
    expect(idsIn(read(), colB)).not.toContain(moving);
  });
});
