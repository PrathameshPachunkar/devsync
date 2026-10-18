import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  columnIds,
  createTestApp,
  getBoard,
  idsIn,
  signInDemo,
  signUp,
  type TestContext,
} from "./helpers";

let t: TestContext;
let demo: Awaited<ReturnType<typeof signInDemo>>;

beforeAll(async () => {
  t = await createTestApp();
  demo = await signInDemo(t.app);
});
afterAll(() => t.close());

describe("role-based access control", () => {
  it("lets viewers read but not write", async () => {
    const board = await getBoard(demo.agent, demo.viewer.id);
    expect(board.role).toBe("VIEWER");
    const [colA, colB] = columnIds(board) as [string, string];
    const cardId = idsIn(board, colA)[0]!;

    const move = await demo.agent
      .post(`/v1/boards/${board.id}/cards/${cardId}/move`)
      .send({ toColumnId: colB, prevCardId: null, nextCardId: null })
      .expect(403);
    expect(move.body.error).toMatchObject({
      code: "forbidden",
      details: { permission: "card:move", role: "VIEWER" },
    });
    await demo.agent.post(`/v1/boards/${board.id}/columns`).send({ name: "Nope" }).expect(403);
    await demo.agent
      .patch(`/v1/boards/${board.id}/cards/${cardId}`)
      .send({ title: "x" })
      .expect(403);
  });

  it("lets maintainers edit cards and columns but not delete columns or manage people", async () => {
    const board = await getBoard(demo.agent, demo.maintainer.id);
    const [colA, colB] = columnIds(board) as [string, string];
    await demo.agent
      .post(`/v1/boards/${board.id}/cards/${idsIn(board, colA)[0]}/move`)
      .send({ toColumnId: colB, prevCardId: null, nextCardId: null })
      .expect(200);
    await demo.agent.post(`/v1/boards/${board.id}/columns`).send({ name: "Blocked" }).expect(201);

    await demo.agent.delete(`/v1/boards/${board.id}/columns/${colA}`).expect(403);
    await demo.agent
      .post(`/v1/boards/${board.id}/members`)
      .send({ email: "x@example.test", role: "VIEWER" })
      .expect(403);
    await demo.agent.patch(`/v1/boards/${board.id}`).send({ name: "Renamed" }).expect(403);
    await demo.agent.delete(`/v1/boards/${board.id}`).expect(403);
  });

  it("lets admins do everything", async () => {
    const board = await getBoard(demo.agent, demo.admin.id);
    const column = columnIds(board).at(-1)!;
    await demo.agent.delete(`/v1/boards/${board.id}/columns/${column}`).expect(200);
    const renamed = await demo.agent
      .patch(`/v1/boards/${board.id}`)
      .send({ name: "Core v2", accent: { kind: "custom", hue: 200 } })
      .expect(200);
    expect(renamed.body.data).toMatchObject({
      name: "Core v2",
      accent: { kind: "custom", hue: 200 },
    });
  });

  it("hides boards from non-members with 404, not 403", async () => {
    const outsider = await signUp(t.app, "Mallory");
    const res = await outsider.agent.get(`/v1/boards/${demo.admin.id}`).expect(404);
    expect(res.body.error.code).toBe("board_not_found");
    await outsider.agent.get("/v1/boards/not-a-uuid").expect(404);
    const list = (await outsider.agent.get("/v1/boards").expect(200)).body.data;
    expect(list.some((b: { id: string }) => b.id === demo.admin.id)).toBe(false);
  });

  it("requires authentication for every board route", async () => {
    const res = await (await import("supertest")).default(t.app).get("/v1/boards").expect(401);
    expect(res.body.error.code).toBe("unauthenticated");
  });
});
