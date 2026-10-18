import type { AccentSetting } from "@/lib/theme/accents";

// Moves to packages/shared (zod DTOs) when the API lands in Phase 4.

export const BOARD_ROLES = ["ADMIN", "MAINTAINER", "VIEWER"] as const;
export type BoardRole = (typeof BOARD_ROLES)[number];

export const BOARD_ROLE_LABELS: Readonly<Record<BoardRole, string>> = {
  ADMIN: "Admin",
  MAINTAINER: "Maintainer",
  VIEWER: "Viewer",
};

export interface LinkedRepo {
  readonly owner: string;
  readonly name: string;
}

export interface BoardSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly accent: AccentSetting;
  readonly repo: LinkedRepo | null;
  readonly role: BoardRole;
  readonly columns: readonly string[];
  readonly openTaskCount: number;
  readonly memberCount: number;
}
