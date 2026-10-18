"use client";

import { can, type BoardPermission } from "@devsync/shared";

import { useBoardStore } from "../store/board-store";

/**
 * Boolean selector over the shared RBAC matrix. It only re-renders when the
 * answer flips. The API enforces the same rule, so hiding a control here is
 * UX, not security.
 */
export function useBoardPermission(permission: BoardPermission): boolean {
  return useBoardStore((state) => can(state.role, permission));
}
