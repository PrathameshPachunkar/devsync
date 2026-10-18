"use client";

import { RotateCcw } from "lucide-react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { useBoards } from "../api";
import { BoardCard } from "./board-card";
import { CreateBoardDialog } from "./create-board-dialog";

export function BoardsOverview() {
  const { data: boards, error, isPending, refetch } = useBoards();

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Boards"
        description="Every board can link a GitHub repository and carry its own accent."
        actions={<CreateBoardDialog />}
      />

      {isPending ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <li key={i}>
              <Skeleton className="h-36 rounded-xl" />
            </li>
          ))}
        </ul>
      ) : error ? (
        <div className="grid justify-items-start gap-2">
          <p className="text-sm text-muted-foreground">
            Couldn&apos;t load boards: {error.message}
          </p>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            <RotateCcw data-icon="inline-start" />
            Try again
          </Button>
        </div>
      ) : boards.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
          No boards yet. Create one to get started.
        </p>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {boards.map((board) => (
            <li key={board.id} className="grid">
              <BoardCard board={board} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
