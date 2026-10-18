import type { Metadata } from "next";

import { BoardsOverview } from "@/features/boards/components/boards-overview";

export const metadata: Metadata = { title: "Boards" };

export default function BoardsPage() {
  return <BoardsOverview />;
}
