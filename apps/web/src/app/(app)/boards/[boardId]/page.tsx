import { Suspense } from "react";

import { BoardScreen, BoardSkeleton } from "@/features/board/components/board-screen";

export default function BoardPage({ params }: PageProps<"/boards/[boardId]">) {
  // Awaiting params inside Suspense lets Next prerender the shell for any board id.
  return (
    <Suspense fallback={<BoardSkeleton />}>
      <BoardRoute params={params} />
    </Suspense>
  );
}

async function BoardRoute({ params }: Pick<PageProps<"/boards/[boardId]">, "params">) {
  const { boardId } = await params;
  // Keyed so switching boards creates a fresh store instead of reusing one.
  // Access is checked by the API: non-members get a 404 the screen renders.
  return <BoardScreen key={boardId} boardId={boardId} />;
}
