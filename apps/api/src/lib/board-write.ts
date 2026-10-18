import { boards, eq, sql, type Database, type Transaction } from "@devsync/db";

import { notFound } from "./http-error";

export interface Mutated<T> {
  data: T;
  version: number;
}

/**
 * Runs a board write in a transaction that first increments the board's
 * version. The UPDATE takes a row lock on the board, so concurrent writes to
 * the same board queue up. Two drops computing keys between the same
 * neighbors can never interleave, and every response carries a strictly
 * increasing version that clients use to detect missed updates.
 */
export function withBoardWrite<T>(
  db: Database,
  boardId: string,
  write: (tx: Transaction) => Promise<T>,
): Promise<Mutated<T>> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .update(boards)
      .set({ version: sql`${boards.version} + 1` })
      .where(eq(boards.id, boardId))
      .returning({ version: boards.version });
    if (!row) throw notFound("board_not_found", "Board not found");
    const data = await write(tx);
    return { data, version: row.version };
  });
}
