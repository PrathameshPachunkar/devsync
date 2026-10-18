"use client";

import { BOARD_ROLE_LABELS } from "@devsync/shared";
import { ChartColumn, Eye, Users } from "lucide-react";

import { GitHubIcon } from "@/components/icons/github-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { useBoardPermission } from "../hooks/use-board-permission";
import { preloadAnalytics, preloadGitHubSync, preloadMembers } from "../lazy";
import { useBoardActions, useBoardStore } from "../store/board-store";

export function BoardToolbar() {
  const name = useBoardStore((state) => state.name);
  const role = useBoardStore((state) => state.role);
  const repoLabel = useBoardStore((state) => state.repoLabel);
  const cardCount = useBoardStore((state) => Object.keys(state.cards).length);
  const canMove = useBoardPermission("card:move");
  const { setPanel } = useBoardActions();

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-background px-4 py-3 sm:px-6">
      <span aria-hidden="true" className="size-3 rounded-full bg-primary" />
      <h1 className="text-lg font-semibold tracking-tight">{name}</h1>
      <Badge variant="secondary">{BOARD_ROLE_LABELS[role]}</Badge>
      {!canMove && (
        <Badge variant="outline">
          <Eye data-icon="inline-start" />
          View only
        </Badge>
      )}
      <span className="text-sm text-muted-foreground tabular-nums">{cardCount} cards</span>

      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPanel("members")}
          onPointerEnter={preloadMembers}
          onFocus={preloadMembers}
        >
          <Users data-icon="inline-start" />
          Members
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPanel("analytics")}
          onPointerEnter={preloadAnalytics}
          onFocus={preloadAnalytics}
        >
          <ChartColumn data-icon="inline-start" />
          Analytics
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPanel("github")}
          onPointerEnter={preloadGitHubSync}
          onFocus={preloadGitHubSync}
        >
          <GitHubIcon data-icon="inline-start" />
          {repoLabel ? <span className="font-mono">{repoLabel}</span> : "GitHub"}
        </Button>
      </div>
    </div>
  );
}
