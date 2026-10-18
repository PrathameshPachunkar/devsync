import type { BoardDto, CardDto, ColumnDto } from "@devsync/shared";

import { apiFetch } from "@/lib/api/http";

import type { BoardApi, Mutated } from "./board-api";

const base = (boardId: string) => `/v1/boards/${boardId}`;

/** BoardApi over HTTP against the Express API. */
export const httpBoardApi: BoardApi = {
  getBoard: async (boardId) => (await apiFetch<{ data: BoardDto }>(base(boardId))).data,

  createColumn: ({ boardId, columnId, name }) =>
    apiFetch<Mutated<ColumnDto>>(`${base(boardId)}/columns`, {
      method: "POST",
      body: { id: columnId, name },
    }),
  renameColumn: ({ boardId, columnId, name }) =>
    apiFetch<Mutated<ColumnDto>>(`${base(boardId)}/columns/${columnId}`, {
      method: "PATCH",
      body: { name },
    }),
  moveColumn: ({ boardId, columnId, prevColumnId, nextColumnId }) =>
    apiFetch<Mutated<ColumnDto>>(`${base(boardId)}/columns/${columnId}/move`, {
      method: "POST",
      body: { prevColumnId, nextColumnId },
    }),
  deleteColumn: ({ boardId, columnId }) =>
    apiFetch<Mutated<null>>(`${base(boardId)}/columns/${columnId}`, { method: "DELETE" }),

  createCard: ({ boardId, cardId, columnId, title }) =>
    apiFetch<Mutated<CardDto>>(`${base(boardId)}/cards`, {
      method: "POST",
      body: { id: cardId, columnId, title },
    }),
  moveCard: ({ boardId, cardId, toColumnId, prevCardId, nextCardId }) =>
    apiFetch<Mutated<CardDto>>(`${base(boardId)}/cards/${cardId}/move`, {
      method: "POST",
      body: { toColumnId, prevCardId, nextCardId },
    }),
  updateCard: ({ boardId, cardId, title, description }) =>
    apiFetch<Mutated<CardDto>>(`${base(boardId)}/cards/${cardId}`, {
      method: "PATCH",
      body: { title, description },
    }),
  deleteCard: ({ boardId, cardId }) =>
    apiFetch<Mutated<null>>(`${base(boardId)}/cards/${cardId}`, { method: "DELETE" }),
};
