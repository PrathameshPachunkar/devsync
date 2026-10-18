import { randomUUID } from "node:crypto";

import { cards, eq } from "@devsync/db";
import { comparePositions, MAX_POSITION_LENGTH } from "@devsync/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  columnIds,
  createTestApp,
  getBoard,
  idsIn,
  signInDemo,
  signUp,
  type Client,
  type TestContext,
} from "./helpers";

let t: TestContext;
let agent: Client;
let boardId: string;

beforeAll(async () => {
  t = await createTestApp();
  const demo = await signInDemo(t.app);
  agent = demo.agent;
  boardId = demo.admin.id;
});
afterAll(() => t.close());

describe("boards", () => {
  it("creates a board with default columns and lists it", async () => {
    const { agent: owner } = await signUp(t.app);
    const res = await owner
      .post("/v1/boards")
      .send({ name: "Launch", accent: { kind: "preset", id: "rose" } })
      .expect(201);
    expect(res.body.data).toMatchObject({ name: "Launch", role: "ADMIN", columnCount: 3 });
    const board = await getBoard(owner, res.body.data.id);
    expect(board.columns.map((c) => c.name)).toEqual(["To do", "In progress", "Done"]);

    await owner.delete(`/v1/boards/${board.id}`).expect(204);
    await owner.get(`/v1/boards/${board.id}`).expect(404);
  });
});

describe("cards", () => {
  it("moves a card between neighbors, computing the key on the server", async () => {
    const board = await getBoard(agent, boardId);
    const [colA, colB] = columnIds(board) as [string, string];
    const moving = idsIn(board, colA)[0]!;
    const [first, second] = idsIn(board, colB) as [string, string];

    const res = await agent
      .post(`/v1/boards/${boardId}/cards/${moving}/move`)
      .send({ toColumnId: colB, prevCardId: first, nextCardId: second })
      .expect(200);
    expect(res.body.data.columnId).toBe(colB);
    expect(res.body.version).toBe(board.version + 1);

    const after = await getBoard(agent, boardId);
    expect(idsIn(after, colB).slice(0, 3)).toEqual([first, moving, second]);
    expect(after.version).toBe(board.version + 1);
  });

  it("returns 409 when the drop anchor is gone, so the client refetches", async () => {
    const board = await getBoard(agent, boardId);
    const [colA, colB] = columnIds(board) as [string, string];
    const res = await agent
      .post(`/v1/boards/${boardId}/cards/${idsIn(board, colA)[0]}/move`)
      .send({ toColumnId: colB, prevCardId: randomUUID(), nextCardId: null })
      .expect(409);
    expect(res.body.error.code).toBe("stale_position");
  });

  it("creates cards idempotently with a client-generated id", async () => {
    const board = await getBoard(agent, boardId);
    const columnId = columnIds(board)[0]!;
    const id = randomUUID();
    const body = { id, columnId, title: "Ship the API" };

    const first = await agent.post(`/v1/boards/${boardId}/cards`).send(body).expect(201);
    const retry = await agent.post(`/v1/boards/${boardId}/cards`).send(body).expect(201);
    expect(retry.body.data.id).toBe(first.body.data.id);
    const after = await getBoard(agent, boardId);
    expect(after.cards.filter((c) => c.id === id)).toHaveLength(1);
    expect(idsIn(after, columnId).at(-1)).toBe(id);
  });

  it("updates and deletes cards", async () => {
    const board = await getBoard(agent, boardId);
    // A plain card: synced ones would belong to GitHub. Demo ones are editable anyway.
    const id = board.cards.find((c) => !c.github)!.id;
    const res = await agent
      .patch(`/v1/boards/${boardId}/cards/${id}`)
      .send({ title: "Renamed", description: "  " })
      .expect(200);
    expect(res.body.data).toMatchObject({ title: "Renamed", description: null });
    await agent.delete(`/v1/boards/${boardId}/cards/${id}`).expect(200);
    await agent.patch(`/v1/boards/${boardId}/cards/${id}`).send({ title: "x" }).expect(404);
  });

  it("rejects a move into another board's column", async () => {
    const board = await getBoard(agent, boardId);
    const { agent: other } = await signUp(t.app);
    const foreign = (await other.get("/v1/boards").expect(200)).body.data[0];
    const foreignBoard = await getBoard(other, foreign.id);
    await agent
      .post(`/v1/boards/${boardId}/cards/${board.cards[0]!.id}/move`)
      .send({ toColumnId: foreignBoard.columns[0]!.id, prevCardId: null, nextCardId: null })
      .expect(404);
  });

  it("serializes concurrent moves: every card lands, keys stay unique", async () => {
    const board = await getBoard(agent, boardId);
    const [colA, colB] = columnIds(board) as [string, string];
    const movers = idsIn(board, colA).slice(0, 10);

    const results = await Promise.all(
      movers.map((cardId) =>
        agent
          .post(`/v1/boards/${boardId}/cards/${cardId}/move`)
          .send({ toColumnId: colB, prevCardId: null, nextCardId: null }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual(movers.map(() => 200));
    // Each write saw a distinct board version.
    expect(new Set(results.map((r) => r.body.version)).size).toBe(movers.length);

    const after = await getBoard(agent, boardId);
    const positions = after.cards.filter((c) => c.columnId === colB).map((c) => c.position);
    expect(new Set(positions).size).toBe(positions.length);
    for (const id of movers) expect(idsIn(after, colB)).toContain(id);
  });

  it("rebalances a column when keys grow too long, keeping the order", async () => {
    const created = await agent
      .post(`/v1/boards/${boardId}/columns`)
      .send({ name: "Deep" })
      .expect(201);
    const columnId: string = created.body.data.id;
    const ids: string[] = [];
    for (const title of ["one", "two", "three"]) {
      const res = await agent
        .post(`/v1/boards/${boardId}/cards`)
        .send({ columnId, title })
        .expect(201);
      ids.push(res.body.data.id);
    }
    // Simulate thousands of drops into one gap: neighbors that share a long
    // prefix force a midpoint key past the length limit.
    const longKey = `a0${"V".repeat(MAX_POSITION_LENGTH)}`;
    await t.database.db.update(cards).set({ position: longKey }).where(eq(cards.id, ids[0]!));
    await t.database.db
      .update(cards)
      .set({ position: `${longKey}V` })
      .where(eq(cards.id, ids[1]!));

    await agent
      .post(`/v1/boards/${boardId}/cards/${ids[2]}/move`)
      .send({ toColumnId: columnId, prevCardId: ids[0], nextCardId: ids[1] })
      .expect(200);

    const after = await getBoard(agent, boardId);
    const column = after.cards
      .filter((c) => c.columnId === columnId)
      .sort((a, b) => comparePositions(a.position, b.position));
    expect(column.map((c) => c.id)).toEqual([ids[0], ids[2], ids[1]]);
    for (const card of column) expect(card.position.length).toBeLessThan(8);
  });
});

describe("columns", () => {
  it("creates, renames, reorders, and deletes with cascade", async () => {
    const board = await getBoard(agent, boardId);
    const created = await agent
      .post(`/v1/boards/${boardId}/columns`)
      .send({ name: "  QA  " })
      .expect(201);
    const columnId: string = created.body.data.id;
    expect(created.body.data.name).toBe("QA");

    await agent
      .patch(`/v1/boards/${boardId}/columns/${columnId}`)
      .send({ name: "Testing" })
      .expect(200);
    await agent
      .post(`/v1/boards/${boardId}/columns/${columnId}/move`)
      .send({ prevColumnId: null, nextColumnId: columnIds(board)[0] })
      .expect(200);
    await agent
      .post(`/v1/boards/${boardId}/cards`)
      .send({ columnId, title: "Goes away with its column" })
      .expect(201);

    let after = await getBoard(agent, boardId);
    expect(columnIds(after)[0]).toBe(columnId);
    expect(after.columns.find((c) => c.id === columnId)?.name).toBe("Testing");

    await agent.delete(`/v1/boards/${boardId}/columns/${columnId}`).expect(200);
    after = await getBoard(agent, boardId);
    expect(after.columns.some((c) => c.id === columnId)).toBe(false);
    expect(after.cards.some((c) => c.columnId === columnId)).toBe(false);
  });

  it("validates input and ids", async () => {
    const bad = await agent.post(`/v1/boards/${boardId}/columns`).send({ name: "" }).expect(400);
    expect(bad.body.error.details[0]).toMatchObject({ path: "name" });
    await agent.patch(`/v1/boards/${boardId}/columns/not-a-uuid`).send({ name: "x" }).expect(404);
    await agent
      .patch(`/v1/boards/${boardId}/columns/${randomUUID()}`)
      .send({ name: "x" })
      .expect(404);
  });
});
