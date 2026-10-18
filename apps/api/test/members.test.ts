import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp, signUp, type TestContext } from "./helpers";

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());

async function boardOwnedBy() {
  const owner = await signUp(t.app, "Owner");
  const board = (await owner.agent.post("/v1/boards").send({ name: "Team" }).expect(201)).body.data;
  return { owner, boardId: board.id as string };
}

describe("board members", () => {
  it("adds people by email, and their role takes effect immediately", async () => {
    const { owner, boardId } = await boardOwnedBy();
    const guest = await signUp(t.app, "Viewer Vic");

    await guest.agent.get(`/v1/boards/${boardId}`).expect(404);
    const added = await owner.agent
      .post(`/v1/boards/${boardId}/members`)
      .send({ email: guest.email, role: "VIEWER" })
      .expect(201);
    expect(added.body.data).toMatchObject({ name: "Viewer Vic", role: "VIEWER" });

    const board = (await guest.agent.get(`/v1/boards/${boardId}`).expect(200)).body.data;
    expect(board.role).toBe("VIEWER");
    await guest.agent.post(`/v1/boards/${boardId}/columns`).send({ name: "x" }).expect(403);

    await owner.agent
      .patch(`/v1/boards/${boardId}/members/${guest.user.id}`)
      .send({ role: "MAINTAINER" })
      .expect(200);
    await guest.agent.post(`/v1/boards/${boardId}/columns`).send({ name: "x" }).expect(201);

    const members = (await guest.agent.get(`/v1/boards/${boardId}/members`).expect(200)).body.data;
    expect(members.map((m: { role: string }) => m.role)).toEqual(["ADMIN", "MAINTAINER"]);

    await owner.agent.delete(`/v1/boards/${boardId}/members/${guest.user.id}`).expect(204);
    await guest.agent.get(`/v1/boards/${boardId}`).expect(404);
  });

  it("rejects unknown emails and duplicate members", async () => {
    const { owner, boardId } = await boardOwnedBy();
    const unknown = await owner.agent
      .post(`/v1/boards/${boardId}/members`)
      .send({ email: "ghost@example.test", role: "VIEWER" })
      .expect(404);
    expect(unknown.body.error.code).toBe("user_not_found");

    const other = await signUp(t.app);
    const body = { email: other.email, role: "VIEWER" };
    await owner.agent.post(`/v1/boards/${boardId}/members`).send(body).expect(201);
    const dup = await owner.agent.post(`/v1/boards/${boardId}/members`).send(body).expect(409);
    expect(dup.body.error.code).toBe("already_member");
  });

  it("never leaves a board without an admin", async () => {
    const { owner, boardId } = await boardOwnedBy();
    const second = await signUp(t.app);
    await owner.agent
      .post(`/v1/boards/${boardId}/members`)
      .send({ email: second.email, role: "ADMIN" })
      .expect(201);

    // Two admins: demoting one is fine.
    await second.agent
      .patch(`/v1/boards/${boardId}/members/${owner.user.id}`)
      .send({ role: "VIEWER" })
      .expect(200);
    // Now `second` is the only admin and cannot be demoted.
    const res = await owner.agent
      .patch(`/v1/boards/${boardId}/members/${second.user.id}`)
      .send({ role: "VIEWER" })
      .expect(403); // owner is a viewer now
    expect(res.body.error.code).toBe("forbidden");

    const last = await second.agent
      .patch(`/v1/boards/${boardId}/members/${second.user.id}`)
      .send({ role: "MAINTAINER" })
      .expect(409);
    expect(last.body.error.code).toBe("last_admin");
    await second.agent.delete(`/v1/boards/${boardId}/members/${second.user.id}`).expect(403);
  });
});
