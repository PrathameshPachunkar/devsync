import { describe, expect, it } from "vitest";

import { columnIds, idsIn } from "../test-utils";
import { createMockBoardApi } from "./mock-board-api";

const fast = { latencyMs: [0, 0] as const, storage: null };

describe("mock board API", () => {
  it("seeds a 120-card board for the performance demo", async () => {
    const api = createMockBoardApi(fast);
    const board = await api.getBoard("devsync-core");
    expect(board.cards).toHaveLength(120);
    expect(board.columns).toHaveLength(4);
  });

  it("returns copies, never its internal state", async () => {
    const api = createMockBoardApi(fast);
    const a = await api.getBoard("mobile-app");
    a.cards.length = 0;
    const b = await api.getBoard("mobile-app");
    expect(b.cards.length).toBeGreaterThan(0);
  });

  it("computes positions server-side from neighbor ids", async () => {
    const api = createMockBoardApi(fast);
    const board = await api.getBoard("mobile-app");
    const [colA, colB] = columnIds(board) as [string, string];
    const moving = idsIn(board, colA)[0]!;
    const [first, second] = idsIn(board, colB) as [string, string];

    const result = await api.moveCard({
      boardId: board.id,
      cardId: moving,
      toColumnId: colB,
      prevCardId: first,
      nextCardId: second,
    });

    expect(result.data.columnId).toBe(colB);
    expect(result.version).toBe(board.version + 1);
    const after = await api.getBoard(board.id);
    expect(idsIn(after, colB).slice(0, 3)).toEqual([first, moving, second]);
  });

  it("applies concurrent writes in call order", async () => {
    const api = createMockBoardApi({ ...fast, latencyMs: [0, 5] });
    const board = await api.getBoard("marketing-site");
    const col = columnIds(board)[0]!;
    await Promise.all(
      ["one", "two", "three"].map((title, i) =>
        api.createCard({ boardId: board.id, cardId: `new-${i}`, columnId: col, title }),
      ),
    );
    const after = await api.getBoard(board.id);
    expect(idsIn(after, col).slice(-3)).toEqual(["new-0", "new-1", "new-2"]);
  });

  it("maps model errors to HTTP-like statuses and keeps working after failures", async () => {
    const api = createMockBoardApi(fast);
    await expect(api.getBoard("nope")).rejects.toMatchObject({ status: 404 });
    const board = await api.getBoard("marketing-site");
    await expect(
      api.renameColumn({ boardId: board.id, columnId: "ghost", name: "x" }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      api.renameColumn({ boardId: board.id, columnId: columnIds(board)[0]!, name: "Ideas!" }),
    ).resolves.toMatchObject({ data: { name: "Ideas!" } });
  });

  it("injects failures for rollback demos", async () => {
    const api = createMockBoardApi({ ...fast, failureRate: 1 });
    const board = await api.getBoard("marketing-site");
    await expect(
      api.renameColumn({ boardId: board.id, columnId: columnIds(board)[0]!, name: "x" }),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("persists to storage", async () => {
    const data = new Map<string, string>();
    const storage = {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => void data.set(key, value),
    };
    const first = createMockBoardApi({ latencyMs: [0, 0], storage });
    const board = await first.getBoard("marketing-site");
    await first.renameColumn({ boardId: board.id, columnId: columnIds(board)[0]!, name: "Saved" });

    const second = createMockBoardApi({ latencyMs: [0, 0], storage });
    const reloaded = await second.getBoard("marketing-site");
    expect(reloaded.columns.find((c) => c.name === "Saved")).toBeDefined();
  });
});
