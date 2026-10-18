import type { Metadata } from "next";

import { PageHeader } from "@/components/layout/page-header";
import { BoardCard } from "@/features/boards/components/board-card";
import { MOCK_BOARDS } from "@/features/boards/data/mock-boards";

export const metadata: Metadata = { title: "Boards" };

export default function BoardsPage() {
  return (
    <main className="mx-auto grid w-full max-w-6xl gap-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Boards"
        description="Every board can link a GitHub repository and carry its own accent."
      />
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {MOCK_BOARDS.map((board) => (
          <li key={board.id} className="grid">
            <BoardCard board={board} />
          </li>
        ))}
      </ul>
    </main>
  );
}
