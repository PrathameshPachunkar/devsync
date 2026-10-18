import { githubRuleSchema, linkRepoSchema, updateLinkSchema } from "@devsync/shared";
import { Router } from "express";

import type { AppContext } from "../../context";
import { HttpError, parse } from "../../lib/http-error";
import {
  paramId,
  requireBoardAccess,
  requireBoardPermission,
} from "../../middleware/require-board-permission";
import {
  getGitHubStatus,
  linkRepository,
  setColumnRule,
  unlinkRepository,
  updateLink,
} from "./link.service";

/** /v1/boards/:boardId/github. Mounted under the authenticated boards router. */
export function githubRouter(ctx: AppContext): Router {
  const router = Router({ mergeParams: true });
  const guard = (permission: Parameters<typeof requireBoardPermission>[1]) =>
    requireBoardPermission(ctx.db, permission);

  router.get("/", guard("board:view"), async (req, res) => {
    res.json({ data: await getGitHubStatus(ctx, requireBoardAccess(req).boardId) });
  });

  router.put("/", guard("repo:link"), async (req, res) => {
    const input = parse(linkRepoSchema, req.body);
    res.json({ data: await linkRepository(ctx, requireBoardAccess(req).boardId, input) });
  });

  router.patch("/", guard("repo:link"), async (req, res) => {
    const { pushEnabled } = parse(updateLinkSchema, req.body);
    res.json({ data: await updateLink(ctx, requireBoardAccess(req).boardId, pushEnabled) });
  });

  router.delete("/", guard("repo:link"), async (req, res) => {
    await unlinkRepository(ctx, requireBoardAccess(req).boardId);
    res.status(204).end();
  });

  /** Starts a sync and answers 202 at once. Clients poll GET for progress. */
  router.post("/sync", guard("github:sync"), async (req, res) => {
    const { boardId } = requireBoardAccess(req);
    const status = await getGitHubStatus(ctx, boardId);
    if (!status.link) throw new HttpError(404, "not_linked", "No repository is linked");
    if (status.link.authMode === "demo") {
      throw new HttpError(
        409,
        "demo_repo",
        "Demo boards use sample data. Link a real repository to sync",
      );
    }
    void ctx.jobs?.requestSync(boardId);
    res.status(202).json({ data: { ...status, link: { ...status.link, syncStatus: "syncing" } } });
  });

  router.put("/rules/:columnId", guard("sync:configure"), async (req, res) => {
    const rule = parse(githubRuleSchema, req.body?.rule ?? null);
    const columnId = paramId(req, "columnId", "column_not_found");
    res.json(await setColumnRule(ctx.db, requireBoardAccess(req).boardId, columnId, rule));
  });

  return router;
}
