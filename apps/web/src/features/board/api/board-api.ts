"use client";

import type {
  BoardDto,
  CardDto,
  ColumnDto,
  CreateCardInput,
  CreateColumnInput,
  DeleteCardInput,
  DeleteColumnInput,
  MoveCardInput,
  MoveColumnInput,
  RenameColumnInput,
  UpdateCardInput,
} from "@devsync/shared";
import { createContext, use } from "react";

import { httpBoardApi } from "./http-board-api";

/**
 * Transport-agnostic board API. The app uses the HTTP implementation, and
 * tests inject the in-memory mock through BoardApiProvider. Components and
 * mutation hooks only see this interface. Mutations return the canonical
 * entity together with the new board version.
 */
export interface BoardApi {
  getBoard(boardId: string): Promise<BoardDto>;
  createColumn(input: CreateColumnInput): Promise<Mutated<ColumnDto>>;
  renameColumn(input: RenameColumnInput): Promise<Mutated<ColumnDto>>;
  moveColumn(input: MoveColumnInput): Promise<Mutated<ColumnDto>>;
  deleteColumn(input: DeleteColumnInput): Promise<Mutated<null>>;
  createCard(input: CreateCardInput): Promise<Mutated<CardDto>>;
  moveCard(input: MoveCardInput): Promise<Mutated<CardDto>>;
  updateCard(input: UpdateCardInput): Promise<Mutated<CardDto>>;
  deleteCard(input: DeleteCardInput): Promise<Mutated<null>>;
}

export interface Mutated<T> {
  readonly data: T;
  readonly version: number;
}

export { BoardApiError } from "./errors";

const BoardApiContext = createContext<BoardApi>(httpBoardApi);

export const BoardApiProvider = BoardApiContext.Provider;

export function useBoardApi(): BoardApi {
  return use(BoardApiContext);
}
