import { asc, cards, columns, eq, sql, type Transaction } from "@devsync/db";
import { needsRebalance, positionsBetween } from "@devsync/shared";

/**
 * Fractional keys grow when items are dropped repeatedly into the same gap.
 * Past MAX_POSITION_LENGTH, the siblings get fresh, evenly spaced keys.
 *
 * Positions are unique per container, so a single-pass rewrite could collide
 * mid-statement. Phase one moves every row to a temporary key derived from
 * its id. Phase two writes the final keys.
 */
async function rewritePositions(
  tx: Transaction,
  table: typeof cards | typeof columns,
  ids: string[],
) {
  if (ids.length === 0) return;
  const keys = positionsBetween(null, null, ids.length);
  const temp = sql.join(
    ids.map((id) => sql`(${id}::uuid, ${`~${id}`})`),
    sql`, `,
  );
  const final = sql.join(
    ids.map((id, index) => sql`(${id}::uuid, ${keys[index]!})`),
    sql`, `,
  );
  for (const values of [temp, final]) {
    await tx.execute(
      sql`update ${table} set position = v.position from (values ${values}) as v(id, position) where ${table.id} = v.id`,
    );
  }
}

export async function rebalanceCardsIfNeeded(tx: Transaction, columnId: string, position: string) {
  if (!needsRebalance(position)) return false;
  const rows = await tx
    .select({ id: cards.id })
    .from(cards)
    .where(eq(cards.columnId, columnId))
    .orderBy(asc(cards.position));
  await rewritePositions(
    tx,
    cards,
    rows.map((r) => r.id),
  );
  return true;
}

export async function rebalanceColumnsIfNeeded(tx: Transaction, boardId: string, position: string) {
  if (!needsRebalance(position)) return false;
  const rows = await tx
    .select({ id: columns.id })
    .from(columns)
    .where(eq(columns.boardId, boardId))
    .orderBy(asc(columns.position));
  await rewritePositions(
    tx,
    columns,
    rows.map((r) => r.id),
  );
  return true;
}
