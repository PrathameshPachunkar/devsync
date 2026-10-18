import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createPgliteDatabase, type DatabaseHandle } from "./client";
import { boards, cards, columns, users } from "./schema";
import { asc, eq } from "./index";

let handle: DatabaseHandle;

beforeAll(async () => {
  handle = createPgliteDatabase();
  await handle.migrate();
}, 30_000);
afterAll(() => handle.close());

describe("schema", () => {
  it('sorts positions by byte order (COLLATE "C"), not locale', async () => {
    const [user] = await handle.db.insert(users).values({ name: "U" }).returning();
    const [board] = await handle.db
      .insert(boards)
      .values({ name: "B", createdById: user!.id })
      .returning();
    // Base62 keys: uppercase must sort before lowercase.
    await handle.db.insert(columns).values(
      ["a0", "Zz", "a0V", "B1"].map((position, i) => ({
        boardId: board!.id,
        name: `c${i}`,
        position,
      })),
    );
    const rows = await handle.db
      .select({ position: columns.position })
      .from(columns)
      .where(eq(columns.boardId, board!.id))
      .orderBy(asc(columns.position));
    expect(rows.map((r) => r.position)).toEqual(["B1", "Zz", "a0", "a0V"]);
  });

  it("enforces unique positions per column and cascades deletes", async () => {
    const [user] = await handle.db.insert(users).values({ name: "V" }).returning();
    const [board] = await handle.db
      .insert(boards)
      .values({ name: "B2", createdById: user!.id })
      .returning();
    const [column] = await handle.db
      .insert(columns)
      .values({ boardId: board!.id, name: "Todo", position: "a0" })
      .returning();
    const card = { boardId: board!.id, columnId: column!.id, title: "x", position: "a0" };
    await handle.db.insert(cards).values(card);
    await expect(handle.db.insert(cards).values(card)).rejects.toThrow();

    await handle.db.delete(boards).where(eq(boards.id, board!.id));
    const remaining = await handle.db.select().from(cards).where(eq(cards.boardId, board!.id));
    expect(remaining).toHaveLength(0);
  });
});
