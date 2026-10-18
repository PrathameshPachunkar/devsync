import {
  addMemberSchema,
  createBoardSchema,
  createCardSchema,
  createColumnSchema,
  moveCardSchema,
  moveColumnSchema,
  renameColumnSchema,
  updateBoardSchema,
  updateCardSchema,
  updateMemberSchema,
} from "@devsync/shared";
import { Router } from "express";

import type { AppContext } from "../../context";
import { forbidden, parse } from "../../lib/http-error";
import { requireAuth } from "../../middleware/authenticate";
import {
  paramId,
  requireBoardAccess,
  requireBoardPermission,
} from "../../middleware/require-board-permission";
import { loadBoardDto } from "./board-dto";
import { createBoard, deleteBoard, listBoardSummaries, updateBoard } from "./boards.service";
import { createCard, deleteCard, moveCard, updateCard } from "./cards.service";
import { createColumn, deleteColumn, moveColumn, renameColumn } from "./columns.service";
import { githubRouter } from "../github/github.router";
import { addMember, listMembers, removeMember, updateMemberRole } from "./members.service";

/**
 * /v1/boards. Every route below the board id is guarded by
 * requireBoardPermission with the permission the shared RBAC matrix assigns.
 */
export function boardsRouter(ctx: AppContext): Router {
  const { db } = ctx;
  const router = Router();
  const guard = (permission: Parameters<typeof requireBoardPermission>[1]) =>
    requireBoardPermission(db, permission);

  /* ---------------------------------------------------------------- boards */

  router.get("/", async (req, res) => {
    res.json({ data: await listBoardSummaries(db, requireAuth(req).userId) });
  });

  router.post("/", async (req, res) => {
    const input = parse(createBoardSchema, req.body);
    res.status(201).json({ data: await createBoard(db, requireAuth(req).userId, input) });
  });

  router.get("/:boardId", guard("board:view"), async (req, res) => {
    const { boardId, role } = requireBoardAccess(req);
    res.json({ data: await loadBoardDto(db, boardId, role) });
  });

  router.patch("/:boardId", guard("board:update"), async (req, res) => {
    const input = parse(updateBoardSchema, req.body);
    res.json(
      await updateBoard(db, requireAuth(req).userId, requireBoardAccess(req).boardId, input),
    );
  });

  router.delete("/:boardId", guard("board:delete"), async (req, res) => {
    await deleteBoard(db, requireBoardAccess(req).boardId);
    res.status(204).end();
  });

  /* --------------------------------------------------------------- columns */

  router.post("/:boardId/columns", guard("column:create"), async (req, res) => {
    const input = parse(createColumnSchema, req.body);
    res.status(201).json(await createColumn(db, requireBoardAccess(req).boardId, input));
  });

  router.patch("/:boardId/columns/:columnId", guard("column:rename"), async (req, res) => {
    const { name } = parse(renameColumnSchema, req.body);
    const columnId = paramId(req, "columnId", "column_not_found");
    res.json(await renameColumn(db, requireBoardAccess(req).boardId, columnId, name));
  });

  router.post("/:boardId/columns/:columnId/move", guard("column:reorder"), async (req, res) => {
    const input = parse(moveColumnSchema, req.body);
    const columnId = paramId(req, "columnId", "column_not_found");
    res.json(await moveColumn(db, requireBoardAccess(req).boardId, columnId, input));
  });

  router.delete("/:boardId/columns/:columnId", guard("column:delete"), async (req, res) => {
    const columnId = paramId(req, "columnId", "column_not_found");
    res.json(await deleteColumn(db, requireBoardAccess(req).boardId, columnId));
  });

  /* ----------------------------------------------------------------- cards */

  router.post("/:boardId/cards", guard("card:create"), async (req, res) => {
    const input = parse(createCardSchema, req.body);
    const { boardId } = requireBoardAccess(req);
    res.status(201).json(await createCard(db, boardId, requireAuth(req).userId, input));
  });

  router.patch("/:boardId/cards/:cardId", guard("card:edit"), async (req, res) => {
    const input = parse(updateCardSchema, req.body);
    const cardId = paramId(req, "cardId", "card_not_found");
    res.json(await updateCard(db, requireBoardAccess(req).boardId, cardId, input));
  });

  router.post("/:boardId/cards/:cardId/move", guard("card:move"), async (req, res) => {
    const input = parse(moveCardSchema, req.body);
    const cardId = paramId(req, "cardId", "card_not_found");
    res.json(await moveCard(db, requireBoardAccess(req).boardId, cardId, input));
    // The move may have queued GitHub updates. Deliver them promptly.
    ctx.jobs?.kick();
  });

  router.delete("/:boardId/cards/:cardId", guard("card:delete"), async (req, res) => {
    const cardId = paramId(req, "cardId", "card_not_found");
    res.json(await deleteCard(db, requireBoardAccess(req).boardId, cardId));
  });

  /* --------------------------------------------------------------- members */

  router.get("/:boardId/members", guard("board:view"), async (req, res) => {
    res.json({ data: await listMembers(db, requireBoardAccess(req).boardId) });
  });

  router.post("/:boardId/members", guard("member:manage"), async (req, res) => {
    const input = parse(addMemberSchema, req.body);
    res.status(201).json({ data: await addMember(db, requireBoardAccess(req).boardId, input) });
  });

  router.patch("/:boardId/members/:userId", guard("member:manage"), async (req, res) => {
    const { role } = parse(updateMemberSchema, req.body);
    const userId = paramId(req, "userId", "member_not_found");
    res.json({ data: await updateMemberRole(db, requireBoardAccess(req).boardId, userId, role) });
  });

  router.delete("/:boardId/members/:userId", guard("member:manage"), async (req, res) => {
    const userId = paramId(req, "userId", "member_not_found");
    if (userId === requireAuth(req).userId) {
      // Admins hand off the board before leaving, rather than orphaning it by accident.
      throw forbidden("Ask another admin to remove you");
    }
    await removeMember(db, requireBoardAccess(req).boardId, userId);
    res.status(204).end();
  });

  router.use("/:boardId/github", githubRouter(ctx));

  return router;
}
