import { createHmac, timingSafeEqual } from "node:crypto";

import { webhookDeliveries } from "@devsync/db";
import type { Request, Response } from "express";

import type { AppContext } from "../../context";
import { withBoardWrite } from "../../lib/board-write";
import { HttpError } from "../../lib/http-error";
import { applyChecksStatus, applyRemoteItems, findLinksForRepo } from "./apply";
import type { GhIssue, GhPull } from "./client";
import { fromIssue, fromPull } from "./mapping";

/** Constant-time check of GitHub's X-Hub-Signature-256 (HMAC-SHA256 of the raw body). */
export function verifySignature(secret: string, body: Buffer, header: string | undefined): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = Buffer.from(`sha256=${createHmac("sha256", secret).update(body).digest("hex")}`);
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}

interface WebhookPayload {
  action?: string;
  repository?: { full_name: string };
  issue?: GhIssue;
  pull_request?: GhPull;
  check_suite?: { head_sha: string };
  check_run?: { head_sha: string };
}

/**
 * POST /v1/github/webhooks. It is mounted with a raw body parser, because the
 * signature covers the exact bytes GitHub sent.
 *
 * 1. Verify the signature.
 * 2. Record the delivery id. GitHub redelivers, and duplicates are no-ops.
 * 3. Apply the event to every board linked to the repository.
 */
export function webhookHandler(ctx: AppContext) {
  return async (req: Request, res: Response) => {
    const secret = ctx.github.webhookSecret;
    if (!secret) throw new HttpError(404, "webhooks_disabled", "Webhooks are not configured");
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    if (!verifySignature(secret, body, req.get("x-hub-signature-256"))) {
      throw new HttpError(401, "invalid_signature", "Webhook signature mismatch");
    }

    const event = req.get("x-github-event") ?? "unknown";
    const deliveryId = req.get("x-github-delivery");
    if (event === "ping") return res.json({ ok: true });
    if (!deliveryId) throw new HttpError(400, "missing_delivery", "Missing X-GitHub-Delivery");

    let payload: WebhookPayload;
    try {
      payload = JSON.parse(body.toString("utf8")) as WebhookPayload;
    } catch {
      throw new HttpError(400, "invalid_json", "Webhook body is not JSON");
    }
    const repo = payload.repository?.full_name;

    const fresh = await ctx.db
      .insert(webhookDeliveries)
      .values({ deliveryId, event, repo: repo ?? null })
      .onConflictDoNothing()
      .returning({ id: webhookDeliveries.deliveryId });
    if (fresh.length === 0) return res.status(200).json({ duplicate: true });
    if (!repo) return res.status(202).json({ handled: 0 });

    const links = await findLinksForRepo(ctx.db, repo);
    let handled = 0;

    if (event === "issues" && payload.issue && !payload.issue.pull_request) {
      if (payload.action === "deleted") return res.status(202).json({ handled: 0 });
      const item = fromIssue(repo, payload.issue);
      for (const link of links) {
        await withBoardWrite(ctx.db, link.boardId, (tx) =>
          applyRemoteItems(tx, link.boardId, [item]),
        );
        handled += 1;
      }
    } else if (event === "pull_request" && payload.pull_request) {
      const item = fromPull(repo, payload.pull_request);
      for (const link of links) {
        await withBoardWrite(ctx.db, link.boardId, (tx) =>
          applyRemoteItems(tx, link.boardId, [item]),
        );
        handled += 1;
      }
    } else if ((event === "check_suite" || event === "check_run") && links.length > 0) {
      const sha = payload.check_suite?.head_sha ?? payload.check_run?.head_sha;
      if (sha) {
        // The payload covers one suite or run. Ask GitHub for the combined result.
        const client = await ctx.github.clientForLink(links[0]!);
        const status = await client.getChecksStatus(repo, sha).catch(() => undefined);
        for (const link of links) {
          await withBoardWrite(ctx.db, link.boardId, async (tx) =>
            applyChecksStatus(tx, link.boardId, repo, sha, status),
          );
          handled += 1;
        }
      }
    }

    res.status(202).json({ handled });
  };
}
