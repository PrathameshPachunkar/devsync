import { generateKeyBetween, generateNKeysBetween } from "fractional-indexing";

/**
 * Fractional-index ordering for columns and cards.
 *
 * Positions are base62 strings that sort by byte order. Moving an item writes
 * exactly one row: the new key is generated between its new neighbors. The
 * database column uses COLLATE "C" so Postgres agrees with comparePositions.
 */

/** Keys longer than this get the column rebalanced by a background job. */
export const MAX_POSITION_LENGTH = 64;

export interface Positioned {
  readonly position: string;
}

/**
 * Byte-order comparison. Never use localeCompare here: locale collations
 * treat "a" and "A" as neighbors and would scramble base62 keys.
 */
export function comparePositions(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function byPosition<T extends Positioned>(a: T, b: T): number {
  return comparePositions(a.position, b.position);
}

/** Returns a new array sorted by position. The input is not mutated. */
export function sortByPosition<T extends Positioned>(items: readonly T[]): T[] {
  return [...items].sort(byPosition);
}

/**
 * Key strictly between `before` and `after`. Null means "start" or "end".
 * Throws when before >= after, which signals a stale or corrupt neighbor pair.
 */
export function positionBetween(before: string | null, after: string | null): string {
  if (before !== null && after !== null && comparePositions(before, after) >= 0) {
    throw new RangeError(`Invalid neighbors: "${before}" must sort before "${after}"`);
  }
  return generateKeyBetween(before, after);
}

/** `count` evenly spread keys between the bounds, e.g. for seeding or rebalancing. */
export function positionsBetween(
  before: string | null,
  after: string | null,
  count: number,
): string[] {
  return generateNKeysBetween(before, after, count);
}

export function needsRebalance(position: string): boolean {
  return position.length > MAX_POSITION_LENGTH;
}

export interface Neighbors {
  readonly prevId: string | null;
  readonly nextId: string | null;
}

/**
 * Neighbors of `id` in an already-reordered list. This is what the client
 * sends to the API after a drop. The server recomputes the key from its own
 * view of those neighbors, so a stale client cannot corrupt the order.
 */
export function neighborsOf(orderedIds: readonly string[], id: string): Neighbors {
  const index = orderedIds.indexOf(id);
  if (index === -1) throw new RangeError(`"${id}" is not in the list`);
  return {
    prevId: orderedIds[index - 1] ?? null,
    nextId: orderedIds[index + 1] ?? null,
  };
}

/** The drop anchor no longer exists. Clients refetch and retry. */
export class OrderingConflictError extends Error {
  constructor(message = "Drop target moved. Refreshing") {
    super(message);
    this.name = "OrderingConflictError";
  }
}

/**
 * Position for an item placed among `siblings`, which must exclude the moved
 * item. The anchor is trusted, not the neighbor pair: with `prevId` the item
 * goes right after prev, otherwise right before `nextId`, otherwise at the end.
 * A stale client therefore cannot produce an invalid range. The API and the
 * optimistic client update share this function, so both place a drop the
 * same way.
 */
export function placeAmong(
  siblings: readonly { id: string; position: string }[],
  prevId: string | null,
  nextId: string | null,
): string {
  const sorted = [...siblings].sort(byPosition);

  if (prevId !== null) {
    const index = sorted.findIndex((s) => s.id === prevId);
    if (index === -1) throw new OrderingConflictError();
    return positionBetween(sorted[index]!.position, sorted[index + 1]?.position ?? null);
  }
  if (nextId !== null) {
    const index = sorted.findIndex((s) => s.id === nextId);
    if (index === -1) throw new OrderingConflictError();
    return positionBetween(sorted[index - 1]?.position ?? null, sorted[index]!.position);
  }
  return positionBetween(sorted.at(-1)?.position ?? null, null);
}

/**
 * Key for placing an item between two neighbors, given a lookup of current
 * positions.
 */
export function positionForNeighbors(
  neighbors: Neighbors,
  positionOf: (id: string) => string | undefined,
): string {
  const before = neighbors.prevId === null ? null : (positionOf(neighbors.prevId) ?? null);
  const after = neighbors.nextId === null ? null : (positionOf(neighbors.nextId) ?? null);
  return positionBetween(before, after);
}
