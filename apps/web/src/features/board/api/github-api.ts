"use client";

import type { ColumnDto, GitHubRuleDto, GitHubStatusDto, LinkRepoInput } from "@devsync/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { apiFetch } from "@/lib/api/http";

import { boardKeys } from "./board-queries";

export const githubKey = (boardId: string) => ["board", boardId, "github"] as const;

const base = (boardId: string) => `/v1/boards/${boardId}/github`;

export const githubApi = {
  status: async (boardId: string) =>
    (await apiFetch<{ data: GitHubStatusDto }>(base(boardId))).data,
  link: async (boardId: string, input: Partial<LinkRepoInput> & { repo: string }) =>
    (await apiFetch<{ data: GitHubStatusDto }>(base(boardId), { method: "PUT", body: input })).data,
  update: async (boardId: string, pushEnabled: boolean) =>
    (
      await apiFetch<{ data: GitHubStatusDto }>(base(boardId), {
        method: "PATCH",
        body: { pushEnabled },
      })
    ).data,
  unlink: (boardId: string) => apiFetch<void>(base(boardId), { method: "DELETE" }),
  sync: async (boardId: string) =>
    (await apiFetch<{ data: GitHubStatusDto }>(`${base(boardId)}/sync`, { method: "POST" })).data,
  setRule: (boardId: string, columnId: string, rule: GitHubRuleDto | null) =>
    apiFetch<{ data: ColumnDto; version: number }>(`${base(boardId)}/rules/${columnId}`, {
      method: "PUT",
      body: { rule },
    }),
};

/**
 * Link status. It polls every two seconds while a sync runs, and refreshes the
 * board when the sync finishes so the new cards appear.
 */
export function useGitHubStatus(boardId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: githubKey(boardId),
    queryFn: () => githubApi.status(boardId),
    refetchInterval: (q) => (q.state.data?.link?.syncStatus === "syncing" ? 2000 : false),
  });

  const syncStatus = query.data?.link?.syncStatus;
  const previous = useRef(syncStatus);
  useEffect(() => {
    if (previous.current === "syncing" && syncStatus !== "syncing") {
      void queryClient.invalidateQueries({ queryKey: boardKeys.detail(boardId) });
      void queryClient.invalidateQueries({ queryKey: ["boards"] });
    }
    previous.current = syncStatus;
  }, [boardId, queryClient, syncStatus]);

  return query;
}

export function useGitHubMutations(boardId: string) {
  const queryClient = useQueryClient();
  const setStatus = (status: GitHubStatusDto) =>
    queryClient.setQueryData(githubKey(boardId), status);
  const refreshBoard = () => {
    void queryClient.invalidateQueries({ queryKey: boardKeys.detail(boardId) });
    void queryClient.invalidateQueries({ queryKey: ["boards"] });
  };

  return {
    link: useMutation({
      mutationFn: (input: Partial<LinkRepoInput> & { repo: string }) =>
        githubApi.link(boardId, input),
      onSuccess: (status) => {
        // The first sync starts server-side. Show it while polling.
        setStatus(
          status.link ? { ...status, link: { ...status.link, syncStatus: "syncing" } } : status,
        );
        refreshBoard();
      },
    }),
    update: useMutation({
      mutationFn: (pushEnabled: boolean) => githubApi.update(boardId, pushEnabled),
      onSuccess: setStatus,
    }),
    unlink: useMutation({
      mutationFn: () => githubApi.unlink(boardId),
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: githubKey(boardId) });
        refreshBoard();
      },
    }),
    sync: useMutation({ mutationFn: () => githubApi.sync(boardId), onSuccess: setStatus }),
    setRule: useMutation({
      mutationFn: ({ columnId, rule }: { columnId: string; rule: GitHubRuleDto | null }) =>
        githubApi.setRule(boardId, columnId, rule),
      onSuccess: refreshBoard,
    }),
  };
}
