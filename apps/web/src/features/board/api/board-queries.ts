import { queryOptions } from "@tanstack/react-query";

import type { BoardApi } from "./board-api";

export const boardKeys = {
  all: ["board"] as const,
  detail: (boardId: string) => ["board", boardId] as const,
};

/** Shared key for every board write, used to count in-flight mutations. */
export const BOARD_MUTATION_KEY = ["board-mutation"] as const;

export function boardQueryOptions(api: BoardApi, boardId: string) {
  return queryOptions({
    queryKey: boardKeys.detail(boardId),
    queryFn: () => api.getBoard(boardId),
  });
}
