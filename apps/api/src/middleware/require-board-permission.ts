import { and, boardMembers, eq, type Database } from "@devsync/db";
import { BOARD_ROLE_LABELS, can, type BoardPermission, type BoardRole } from "@devsync/shared";
import type { NextFunction, Request, Response } from "express";
import { z } from "zod";

import { forbidden, notFound } from "../lib/http-error";
import { requireAuth } from "./authenticate";

const uuid = z.uuid();

/** Express 5 types params as string | string[] (for wildcards). Ours are plain strings. */
function stringParam(req: Request, name: string): string | undefined {
  const value = req.params[name];
  return typeof value === "string" ? value : undefined;
}

/**
 * RBAC guard. It resolves the caller's role on :boardId and checks it against
 * the shared permission matrix.
 *
 * Non-members get 404, not 403, so board ids cannot be probed for existence.
 * Members without the permission get 403 with the role they would need.
 */
export function requireBoardPermission(db: Database, permission: BoardPermission) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const { userId } = requireAuth(req);
    const boardId = stringParam(req, "boardId");
    if (!boardId || !uuid.safeParse(boardId).success) {
      throw notFound("board_not_found", "Board not found");
    }

    const [membership] = await db
      .select({ role: boardMembers.role })
      .from(boardMembers)
      .where(and(eq(boardMembers.boardId, boardId), eq(boardMembers.userId, userId)));
    if (!membership) throw notFound("board_not_found", "Board not found");

    if (!can(membership.role, permission)) {
      throw forbidden(`${BOARD_ROLE_LABELS[membership.role]}s can't do that on this board`, {
        permission,
        role: membership.role,
      });
    }
    req.boardAccess = { boardId, role: membership.role };
    next();
  };
}

export function requireBoardAccess(req: Request): { boardId: string; role: BoardRole } {
  if (!req.boardAccess) throw new Error("requireBoardPermission must run first");
  return req.boardAccess;
}

/** Route params other than :boardId. A malformed id is simply not found. */
export function paramId(req: Request, name: string, code: string): string {
  const value = stringParam(req, name);
  if (!value || !uuid.safeParse(value).success) throw notFound(code, "Not found");
  return value;
}
