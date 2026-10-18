import { notFound } from "next/navigation";
import { Suspense } from "react";

import { GitHubIcon } from "@/components/icons/github-icon";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getMockBoard } from "@/features/boards/data/mock-boards";
import { BOARD_ROLE_LABELS } from "@/features/boards/types";
import { accentScopeProps } from "@/lib/theme/accents";

export default function BoardPage({ params }: PageProps<"/boards/[boardId]">) {
  // Awaiting params inside Suspense lets Next prerender the shell for any board id.
  return (
    <Suspense fallback={<BoardSkeleton />}>
      <BoardView params={params} />
    </Suspense>
  );
}

async function BoardView({ params }: Pick<PageProps<"/boards/[boardId]">, "params">) {
  const { boardId } = await params;
  const board = getMockBoard(boardId);
  if (!board) notFound();

  return (
    // The board's accent overrides the global one for this subtree only.
    <div {...accentScopeProps(board.accent)} className="flex min-h-0 flex-1 flex-col bg-board">
      <div className="flex flex-wrap items-center gap-3 border-b bg-background px-4 py-3 sm:px-6">
        <span aria-hidden="true" className="size-3 rounded-full bg-primary" />
        <h1 className="text-lg font-semibold tracking-tight">{board.name}</h1>
        <Badge variant="secondary">{BOARD_ROLE_LABELS[board.role]}</Badge>
        {board.repo && (
          <Badge variant="outline" className="font-mono">
            <GitHubIcon data-icon="inline-start" />
            {board.repo.owner}/{board.repo.name}
          </Badge>
        )}
      </div>

      <section
        aria-label="Board columns"
        className="flex min-h-0 flex-1 gap-4 overflow-x-auto p-4 sm:p-6"
      >
        {board.columns.map((column, index) => (
          <div
            key={column}
            className="flex w-72 shrink-0 flex-col gap-2 self-start rounded-xl bg-column p-2"
          >
            <h2 className="px-1.5 py-1 text-xs font-medium tracking-wide text-column-foreground uppercase">
              {column}
            </h2>
            {Array.from({ length: Math.max(1, 3 - index) }, (_, card) => (
              <div
                key={card}
                className="grid gap-2 rounded-lg border border-task-border bg-task p-3 shadow-xs"
              >
                <Skeleton className="h-3 w-4/5" />
                <Skeleton className="h-3 w-2/5" />
              </div>
            ))}
          </div>
        ))}
        <p className="self-center px-4 text-sm text-muted-foreground">
          The drag-and-drop Kanban engine arrives in Phase 3.
        </p>
      </section>
    </div>
  );
}

function BoardSkeleton() {
  return (
    <div className="flex flex-1 flex-col bg-board" aria-busy="true" aria-label="Loading board">
      <div className="flex items-center gap-3 border-b bg-background px-4 py-3 sm:px-6">
        <Skeleton className="size-3 rounded-full" />
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="flex gap-4 p-4 sm:p-6">
        {[0, 1, 2].map((column) => (
          <Skeleton key={column} className="h-48 w-72 shrink-0 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
