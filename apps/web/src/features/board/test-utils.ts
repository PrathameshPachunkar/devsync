import type { BoardDto } from "@devsync/shared";

import { seedBoard } from "./api/mock-seed";

export const NOW = "2026-10-18T12:00:00.000Z";

export function seed(boardId = "devsync-core"): BoardDto {
  const board = seedBoard(boardId);
  if (!board) throw new Error(`No seed for ${boardId}`);
  return board;
}

/** Card ids of a column, in position order. */
export function idsIn(board: BoardDto, columnId: string): string[] {
  return board.cards
    .filter((c) => c.columnId === columnId)
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0))
    .map((c) => c.id);
}

export function columnIds(board: BoardDto): string[] {
  return [...board.columns]
    .sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : 0))
    .map((c) => c.id);
}
