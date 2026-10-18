"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, RotateCcw } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { isApiError } from "@/lib/api/http";
import { accentScopeProps } from "@/lib/theme/accents";

import { useBoardApi } from "../api/board-api";
import { boardQueryOptions } from "../api/board-queries";
import { BoardStoreProvider, useBoardStore } from "../store/board-store";
import { BoardCanvas } from "./board-canvas";
import { BoardOverlays } from "./board-overlays";
import { BoardToolbar } from "./board-toolbar";

/** Full-height board below the app topbar (h-14). Columns scroll internally. */
const BOARD_FRAME = "flex h-[calc(100svh-3.5rem)] min-h-0 flex-col bg-board";

export function BoardScreen({ boardId }: { boardId: string }) {
  const api = useBoardApi();
  const { data, error, isPending, refetch } = useQuery(boardQueryOptions(api, boardId));

  if (isPending) return <BoardSkeleton />;
  if (isApiError(error, 404)) {
    return (
      <div className={`${BOARD_FRAME} items-center justify-center gap-3 p-6 text-center`}>
        <p className="font-medium">Board not found</p>
        <p className="text-sm text-muted-foreground">
          It may have been deleted, or you are not a member of it.
        </p>
        <Button variant="outline" size="sm" asChild>
          <Link href="/boards">
            <ArrowLeft data-icon="inline-start" />
            All boards
          </Link>
        </Button>
      </div>
    );
  }
  if (error) {
    return (
      <div className={`${BOARD_FRAME} items-center justify-center gap-3 p-6 text-center`}>
        <p className="font-medium">Couldn&apos;t load this board</p>
        <p className="text-sm text-muted-foreground">{error.message}</p>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          <RotateCcw data-icon="inline-start" />
          Try again
        </Button>
      </div>
    );
  }

  return (
    <BoardStoreProvider board={data}>
      <BoardFrame />
    </BoardStoreProvider>
  );
}

function BoardFrame() {
  const accent = useBoardStore((state) => state.accent);
  return (
    // The board's accent overrides the global one for this subtree only.
    <div {...(accent ? accentScopeProps(accent) : {})} className={BOARD_FRAME}>
      <BoardToolbar />
      <BoardCanvas />
      <BoardOverlays />
    </div>
  );
}

export function BoardSkeleton() {
  return (
    <div className={BOARD_FRAME} aria-busy="true" aria-label="Loading board">
      <div className="flex items-center gap-3 border-b bg-background px-4 py-3 sm:px-6">
        <Skeleton className="size-3 rounded-full" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="ml-auto h-7 w-48" />
      </div>
      <div className="flex gap-3 overflow-hidden p-4 sm:p-6">
        {[5, 3, 4, 2].map((cards, column) => (
          <div key={column} className="grid w-72 shrink-0 gap-2 rounded-xl bg-column p-2">
            <Skeleton className="h-4 w-24" />
            {Array.from({ length: cards }, (_, card) => (
              <Skeleton key={card} className="h-20 rounded-lg" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
