/**
 * Single source of truth for per-board RBAC. The API enforces it in the
 * requireBoardPermission middleware. The web app uses the same table to hide
 * controls a member cannot use.
 */

export const BOARD_ROLES = ["ADMIN", "MAINTAINER", "VIEWER"] as const;
export type BoardRole = (typeof BOARD_ROLES)[number];

export const BOARD_ROLE_LABELS: Readonly<Record<BoardRole, string>> = {
  ADMIN: "Admin",
  MAINTAINER: "Maintainer",
  VIEWER: "Viewer",
};

const EVERYONE: readonly BoardRole[] = ["ADMIN", "MAINTAINER", "VIEWER"];
const EDITORS: readonly BoardRole[] = ["ADMIN", "MAINTAINER"];
const ADMINS: readonly BoardRole[] = ["ADMIN"];

export const BOARD_PERMISSIONS = {
  "board:view": EVERYONE,
  "board:update": ADMINS,
  "card:create": EDITORS,
  "card:edit": EDITORS,
  "card:move": EDITORS,
  "card:delete": EDITORS,
  "column:create": EDITORS,
  "column:rename": EDITORS,
  "column:reorder": EDITORS,
  "column:delete": ADMINS,
  "repo:link": ADMINS,
  "sync:configure": ADMINS,
  "github:sync": EDITORS,
  "member:manage": ADMINS,
  "board:delete": ADMINS,
} as const satisfies Record<string, readonly BoardRole[]>;

export type BoardPermission = keyof typeof BOARD_PERMISSIONS;

export function can(role: BoardRole, permission: BoardPermission): boolean {
  return (BOARD_PERMISSIONS[permission] as readonly BoardRole[]).includes(role);
}

export function isBoardRole(value: unknown): value is BoardRole {
  return typeof value === "string" && (BOARD_ROLES as readonly string[]).includes(value);
}
