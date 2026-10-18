"use client";

import type {
  BoardDto,
  CreateCardInput,
  CreateColumnInput,
  DeleteCardInput,
  DeleteColumnInput,
  MoveCardInput,
  MoveColumnInput,
  RenameColumnInput,
  UpdateCardInput,
} from "@devsync/shared";
import { useMutation, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  applyCreateCard,
  applyCreateColumn,
  applyDeleteCard,
  applyDeleteColumn,
  applyMoveCard,
  applyMoveColumn,
  applyRenameColumn,
  applyUpdateCard,
} from "../model/board-updates";
import { useBoardApi, type BoardApi } from "./board-api";
import { BOARD_MUTATION_KEY, boardKeys } from "./board-queries";

interface OptimisticConfig<TInput extends { boardId: string }> {
  mutationFn: (api: BoardApi, input: TInput) => Promise<unknown>;
  /** Same pure transition the server runs. */
  apply: (board: BoardDto, input: TInput, now: string) => BoardDto;
  errorMessage: string;
}

interface Snapshot {
  previous: BoardDto | undefined;
}

function inFlightForBoard(client: QueryClient, boardId: string): number {
  return client.isMutating({
    mutationKey: BOARD_MUTATION_KEY,
    predicate: (mutation) =>
      (mutation.state.variables as { boardId?: string } | undefined)?.boardId === boardId,
  });
}

/**
 * Optimistic board write.
 *
 * 1. onMutate applies the change to the cached board immediately. The view
 *    store syncs from the cache, so the UI never waits for the network.
 * 2. onError rolls back to the snapshot when this is the only write in
 *    flight. With several overlapping writes a snapshot could erase a newer
 *    optimistic change, so the final refetch restores the truth instead.
 * 3. onSettled refetches canonical server state once the last in-flight
 *    write for this board settles, so positions converge with the server.
 */
function useOptimisticBoardMutation<TInput extends { boardId: string }>(
  config: OptimisticConfig<TInput>,
) {
  const api = useBoardApi();

  return useMutation<unknown, Error, TInput, Snapshot>({
    mutationKey: BOARD_MUTATION_KEY,
    mutationFn: (input) => config.mutationFn(api, input),
    onMutate: async (input, { client }) => {
      const key = boardKeys.detail(input.boardId);
      // Stop an in-flight refetch from overwriting the optimistic state.
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<BoardDto>(key);
      if (previous) {
        client.setQueryData<BoardDto>(key, config.apply(previous, input, new Date().toISOString()));
      }
      return { previous };
    },
    onError: (error, input, snapshot, { client }) => {
      if (snapshot?.previous && inFlightForBoard(client, input.boardId) === 1) {
        client.setQueryData(boardKeys.detail(input.boardId), snapshot.previous);
      }
      toast.error(config.errorMessage, {
        description: `${error.message}. Your change was reverted.`,
      });
    },
    onSettled: (_data, _error, input, _snapshot, { client }) => {
      if (inFlightForBoard(client, input.boardId) === 1) {
        // Board list counts (open cards, columns) may have changed too.
        void client.invalidateQueries({ queryKey: ["boards"] });
        return client.invalidateQueries({ queryKey: boardKeys.detail(input.boardId) });
      }
    },
  });
}

export const useMoveCard = () =>
  useOptimisticBoardMutation<MoveCardInput>({
    mutationFn: (api, input) => api.moveCard(input),
    apply: applyMoveCard,
    errorMessage: "Couldn't move card",
  });

export const useMoveColumn = () =>
  useOptimisticBoardMutation<MoveColumnInput>({
    mutationFn: (api, input) => api.moveColumn(input),
    apply: applyMoveColumn,
    errorMessage: "Couldn't reorder columns",
  });

export const useCreateColumn = () =>
  useOptimisticBoardMutation<CreateColumnInput>({
    mutationFn: (api, input) => api.createColumn(input),
    apply: applyCreateColumn,
    errorMessage: "Couldn't create column",
  });

export const useRenameColumn = () =>
  useOptimisticBoardMutation<RenameColumnInput>({
    mutationFn: (api, input) => api.renameColumn(input),
    apply: applyRenameColumn,
    errorMessage: "Couldn't rename column",
  });

export const useDeleteColumn = () =>
  useOptimisticBoardMutation<DeleteColumnInput>({
    mutationFn: (api, input) => api.deleteColumn(input),
    apply: applyDeleteColumn,
    errorMessage: "Couldn't delete column",
  });

export const useCreateCard = () =>
  useOptimisticBoardMutation<CreateCardInput>({
    mutationFn: (api, input) => api.createCard(input),
    apply: applyCreateCard,
    errorMessage: "Couldn't create card",
  });

export const useUpdateCard = () =>
  useOptimisticBoardMutation<UpdateCardInput>({
    mutationFn: (api, input) => api.updateCard(input),
    apply: applyUpdateCard,
    errorMessage: "Couldn't save card",
  });

export const useDeleteCard = () =>
  useOptimisticBoardMutation<DeleteCardInput>({
    mutationFn: (api, input) => api.deleteCard(input),
    apply: applyDeleteCard,
    errorMessage: "Couldn't delete card",
  });
