"use client";

import type { BoardMemberDto, BoardRole, BoardSummaryDto, CreateBoardBody } from "@devsync/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api/http";

export const boardsKey = ["boards"] as const;
export const membersKey = (boardId: string) => ["board", boardId, "members"] as const;

export const boardsApi = {
  list: async () => (await apiFetch<{ data: BoardSummaryDto[] }>("/v1/boards")).data,
  create: async (input: Partial<CreateBoardBody> & { name: string }) =>
    (await apiFetch<{ data: BoardSummaryDto }>("/v1/boards", { method: "POST", body: input })).data,
  members: async (boardId: string) =>
    (await apiFetch<{ data: BoardMemberDto[] }>(`/v1/boards/${boardId}/members`)).data,
  addMember: (boardId: string, input: { email: string; role: BoardRole }) =>
    apiFetch(`/v1/boards/${boardId}/members`, { method: "POST", body: input }),
  updateMember: (boardId: string, userId: string, role: BoardRole) =>
    apiFetch(`/v1/boards/${boardId}/members/${userId}`, { method: "PATCH", body: { role } }),
  removeMember: (boardId: string, userId: string) =>
    apiFetch(`/v1/boards/${boardId}/members/${userId}`, { method: "DELETE" }),
};

/** Boards the signed-in user belongs to. Shared by the sidebar, list, and breadcrumbs. */
export function useBoards() {
  return useQuery({ queryKey: boardsKey, queryFn: boardsApi.list });
}

export function useCreateBoard() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: boardsApi.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: boardsKey }),
  });
}

export function useBoardMembers(boardId: string) {
  return useQuery({ queryKey: membersKey(boardId), queryFn: () => boardsApi.members(boardId) });
}

/** Membership changes are rare and need server validation, so they are not optimistic. */
export function useMemberMutations(boardId: string) {
  const queryClient = useQueryClient();
  const onSuccess = () => {
    void queryClient.invalidateQueries({ queryKey: membersKey(boardId) });
    void queryClient.invalidateQueries({ queryKey: boardsKey });
  };
  return {
    add: useMutation({
      mutationFn: (input: { email: string; role: BoardRole }) =>
        boardsApi.addMember(boardId, input),
      onSuccess,
    }),
    update: useMutation({
      mutationFn: ({ userId, role }: { userId: string; role: BoardRole }) =>
        boardsApi.updateMember(boardId, userId, role),
      onSuccess,
    }),
    remove: useMutation({
      mutationFn: (userId: string) => boardsApi.removeMember(boardId, userId),
      onSuccess,
    }),
  };
}
