import type { BoardDto, CardDto, ColumnDto } from "@devsync/shared";

import {
  applyCreateCard,
  applyCreateColumn,
  applyDeleteCard,
  applyDeleteColumn,
  applyMoveCard,
  applyMoveColumn,
  applyRenameColumn,
  applyUpdateCard,
  BoardUpdateError,
} from "../model/board-updates";
import type { BoardApi, Mutated } from "./board-api";
import { BoardApiError } from "./errors";
import { seedBoard } from "./mock-seed";

/**
 * In-browser stand-in for the Phase 4 Express API. It behaves like the real
 * server where it matters:
 *  - network latency, with optional failure injection to exercise rollback
 *  - writes are serialized, like the row lock in the real move transaction
 *  - positions are recomputed server-side from neighbor ids
 *  - state persists in localStorage, so a reload keeps your changes
 */

export interface MockBoardApiOptions {
  /** [min, max] simulated latency in ms. */
  latencyMs?: readonly [number, number];
  /** 0..1 probability that a write fails. */
  failureRate?: number | (() => number);
  /** Pass null to keep everything in memory (tests). */
  storage?: Pick<Storage, "getItem" | "setItem"> | null;
  random?: () => number;
}

const STORAGE_PREFIX = "devsync:mock-board:v1:";
export const MOCK_FAILURE_RATE_KEY = "devsync:mock-failure-rate";

function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function storedFailureRate(): number {
  const raw = browserStorage()?.getItem(MOCK_FAILURE_RATE_KEY);
  const rate = raw ? Number(raw) : 0;
  return Number.isFinite(rate) ? Math.min(Math.max(rate, 0), 1) : 0;
}

const clone = <T>(value: T): T => structuredClone(value);

export function createMockBoardApi(options: MockBoardApiOptions = {}): BoardApi {
  const { latencyMs = [120, 320], random = Math.random } = options;
  const storage = options.storage === undefined ? browserStorage() : options.storage;
  const failureRate =
    typeof options.failureRate === "function"
      ? options.failureRate
      : () => (options.failureRate as number | undefined) ?? 0;
  const boards = new Map<string, BoardDto>();
  let writeQueue: Promise<unknown> = Promise.resolve();

  const delay = () => {
    const [min, max] = latencyMs;
    const ms = min + random() * (max - min);
    return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
  };

  function load(boardId: string): BoardDto {
    const cached = boards.get(boardId);
    if (cached) return cached;
    let board: BoardDto | null = null;
    const raw = storage?.getItem(STORAGE_PREFIX + boardId);
    if (raw) {
      try {
        board = JSON.parse(raw) as BoardDto;
      } catch {
        board = null;
      }
    }
    board ??= seedBoard(boardId);
    if (!board) throw new BoardApiError("Board not found", 404);
    boards.set(boardId, board);
    return board;
  }

  function write<T>(boardId: string, update: (board: BoardDto, now: string) => [BoardDto, T]) {
    const run = async (): Promise<Mutated<T>> => {
      await delay();
      if (random() < failureRate()) throw new BoardApiError("Network error (simulated)", 503);
      try {
        const [next, data] = update(load(boardId), new Date().toISOString());
        boards.set(boardId, next);
        storage?.setItem(STORAGE_PREFIX + boardId, JSON.stringify(next));
        return { data: clone(data), version: next.version };
      } catch (error) {
        if (error instanceof BoardUpdateError) {
          throw new BoardApiError(error.message, error.code === "not_found" ? 404 : 409);
        }
        throw error;
      }
    };
    // Serialize writes. A failed write must not block the ones behind it.
    const result = writeQueue.then(run, run);
    writeQueue = result.catch(() => undefined);
    return result;
  }

  const column = (board: BoardDto, id: string): ColumnDto => {
    const found = board.columns.find((c) => c.id === id);
    if (!found) throw new BoardUpdateError("Column not found", "not_found");
    return found;
  };
  const card = (board: BoardDto, id: string): CardDto => {
    const found = board.cards.find((c) => c.id === id);
    if (!found) throw new BoardUpdateError("Card not found", "not_found");
    return found;
  };

  return {
    async getBoard(boardId) {
      await delay();
      return clone(load(boardId));
    },
    createColumn: (input) =>
      write(input.boardId, (board) => {
        const next = applyCreateColumn(board, input);
        return [next, column(next, input.columnId)];
      }),
    renameColumn: (input) =>
      write(input.boardId, (board) => {
        const next = applyRenameColumn(board, input);
        return [next, column(next, input.columnId)];
      }),
    moveColumn: (input) =>
      write(input.boardId, (board) => {
        const next = applyMoveColumn(board, input);
        return [next, column(next, input.columnId)];
      }),
    deleteColumn: (input) =>
      write(input.boardId, (board) => [applyDeleteColumn(board, input), null]),
    createCard: (input) =>
      write(input.boardId, (board, now) => {
        const next = applyCreateCard(board, input, now);
        return [next, card(next, input.cardId)];
      }),
    moveCard: (input) =>
      write(input.boardId, (board, now) => {
        const next = applyMoveCard(board, input, now);
        return [next, card(next, input.cardId)];
      }),
    updateCard: (input) =>
      write(input.boardId, (board, now) => {
        const next = applyUpdateCard(board, input, now);
        return [next, card(next, input.cardId)];
      }),
    deleteCard: (input) => write(input.boardId, (board) => [applyDeleteCard(board, input), null]),
  };
}

/**
 * App-wide instance. To demo optimistic rollback, set a failure rate in the
 * browser console: localStorage.setItem("devsync:mock-failure-rate", "0.5")
 */
export const mockBoardApi: BoardApi = createMockBoardApi({ failureRate: storedFailureRate });
