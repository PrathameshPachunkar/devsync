import type { BoardSummary } from "../types";

/**
 * Static fixtures for the UI shell. Replaced by TanStack Query calls to the
 * Express API in Phase 4.
 */
export const MOCK_BOARDS: readonly BoardSummary[] = [
  {
    id: "devsync-core",
    name: "DevSync Core",
    description: "Kanban engine, realtime sync, and the public API.",
    accent: { kind: "preset", id: "indigo" },
    repo: { owner: "devsync", name: "devsync" },
    role: "ADMIN",
    columns: ["Backlog", "In progress", "In review", "Done"],
    openTaskCount: 42,
    memberCount: 6,
  },
  {
    id: "mobile-app",
    name: "Mobile App",
    description: "React Native client and push notifications.",
    accent: { kind: "preset", id: "teal" },
    repo: { owner: "devsync", name: "mobile" },
    role: "MAINTAINER",
    columns: ["Todo", "Doing", "QA", "Shipped"],
    openTaskCount: 17,
    memberCount: 4,
  },
  {
    id: "marketing-site",
    name: "Marketing Site",
    description: "Landing pages, docs, and the changelog.",
    accent: { kind: "preset", id: "rose" },
    repo: null,
    role: "VIEWER",
    columns: ["Ideas", "Writing", "Published"],
    openTaskCount: 9,
    memberCount: 3,
  },
];

export function getMockBoard(id: string): BoardSummary | undefined {
  return MOCK_BOARDS.find((board) => board.id === id);
}
