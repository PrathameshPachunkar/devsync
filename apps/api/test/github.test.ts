import { createHmac, generateKeyPairSync, randomUUID } from "node:crypto";

import { boardRepos, eq, githubOutbox, sql } from "@devsync/db";
import type { BoardDto, CardDto, GitHubStatusDto } from "@devsync/shared";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { FAKE_GITHUB_URL, FakeGitHub } from "./fake-github";
import {
  columnIds,
  createTestApp,
  getBoard,
  signInDemo,
  signUp,
  type Client,
  type TestContext,
} from "./helpers";

const SECRET = "test-webhook-secret-123456";
const WRITE_TOKEN = "github_pat_writer";
const READ_TOKEN = "github_pat_reader";

let github: FakeGitHub;
let t: TestContext;

beforeAll(async () => {
  github = new FakeGitHub();
  t = await createTestApp(
    {
      GITHUB_API_URL: FAKE_GITHUB_URL,
      GITHUB_WEBHOOK_SECRET: SECRET,
      TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    },
    github.fetch,
  );
});
afterAll(() => t.close());

let repoCounter = 0;
/** A fresh repo with two open issues, one open draft PR with checks, and one closed issue. */
function seedRepo(options: { private?: boolean } = {}) {
  const name = `acme/app-${++repoCounter}`;
  github.addRepo(name, {
    private: options.private ?? false,
    readers: [READ_TOKEN],
    writers: [WRITE_TOKEN],
  });
  github.addItem(name, { title: "Login is slow", labels: ["bug", "perf"], assignees: ["octocat"] });
  github.addItem(name, { title: "Dark mode", labels: ["enhancement"] });
  const pr = github.addItem(name, {
    title: "Speed up login",
    isPull: true,
    draft: true,
    head: { ref: "fix/login", sha: "abc123" },
  });
  github.addItem(name, { title: "Old closed bug", state: "closed" });
  github.checkRuns.set(pr.head.sha, [
    { status: "completed", conclusion: "success" },
    { status: "in_progress", conclusion: null },
  ]);
  return name;
}

async function newBoard(): Promise<{ agent: Client; board: BoardDto }> {
  const { agent } = await signUp(t.app, "Admin Ada");
  const summary = (await agent.post("/v1/boards").send({ name: "Synced" }).expect(201)).body.data;
  return { agent, board: await getBoard(agent, summary.id) };
}

async function link(agent: Client, boardId: string, body: Record<string, unknown>) {
  const res = await agent.put(`/v1/boards/${boardId}/github`).send(body);
  await t.ctx.jobs!.idle();
  return res;
}

const status = async (agent: Client, boardId: string) =>
  (await agent.get(`/v1/boards/${boardId}/github`).expect(200)).body.data as GitHubStatusDto;

const byTitle = (board: BoardDto, title: string) =>
  board.cards.find((c) => c.title === title) as CardDto;
const columnName = (board: BoardDto, card: CardDto) =>
  board.columns.find((c) => c.id === card.columnId)?.name;

function sendWebhook(
  event: string,
  payload: unknown,
  delivery: string = randomUUID(),
  secret = SECRET,
) {
  const body = JSON.stringify(payload);
  return request(t.app)
    .post("/v1/github/webhooks")
    .set("Content-Type", "application/json")
    .set("X-GitHub-Event", event)
    .set("X-GitHub-Delivery", delivery)
    .set("X-Hub-Signature-256", `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`)
    .send(body);
}

beforeEach(() => {
  github.rateLimited = false;
  github.failures.length = 0;
});

describe("linking and pull sync", () => {
  it("links a public repo read-only and imports open issues and PRs", async () => {
    const repo = seedRepo();
    const { agent, board } = await newBoard();
    const res = await link(agent, board.id, { repo: `https://github.com/${repo}.git` });
    expect(res.status).toBe(200);

    const linkStatus = (await status(agent, board.id)).link!;
    expect(linkStatus).toMatchObject({
      authMode: "public",
      canPush: false,
      syncStatus: "idle",
      lastSyncError: null,
    });
    expect(linkStatus.lastSyncedAt).not.toBeNull();

    const synced = await getBoard(agent, board.id);
    expect(synced.cards.map((c) => c.title).sort()).toEqual([
      "Dark mode",
      "Login is slow",
      "Speed up login",
    ]);
    const pr = byTitle(synced, "Speed up login");
    expect(pr.github).toMatchObject({
      kind: "pull_request",
      state: "open",
      isDraft: true,
      headRef: "fix/login",
      checksStatus: "pending",
    });
    const bug = byTitle(synced, "Login is slow");
    expect(bug.labels.map((l) => l.name)).toEqual(["bug", "perf"]);
    expect(bug.github?.assignees).toEqual([
      { login: "octocat", avatarUrl: "https://avatars.test/octocat" },
    ]);
    // New items land in the first column. Closed history isn't imported.
    expect(new Set(synced.cards.map((c) => columnName(synced, c)))).toEqual(new Set(["To do"]));
  });

  it("syncs incrementally: updates titles and moves closed and merged items to Done", async () => {
    const repo = seedRepo();
    const { agent, board } = await newBoard();
    await link(agent, board.id, { repo });

    github.update(repo, 1, { title: "Login is slow on Safari" });
    github.update(repo, 2, { state: "closed" });
    github.update(repo, 3, { state: "closed", mergedAt: new Date().toISOString(), draft: false });
    github.addItem(repo, { title: "Brand new issue" });

    await agent.post(`/v1/boards/${board.id}/github/sync`).expect(202);
    await t.ctx.jobs!.idle();

    const synced = await getBoard(agent, board.id);
    expect(byTitle(synced, "Login is slow on Safari")).toBeDefined();
    expect(columnName(synced, byTitle(synced, "Dark mode"))).toBe("Done");
    const pr = byTitle(synced, "Speed up login");
    expect(pr.github?.state).toBe("merged");
    expect(columnName(synced, pr)).toBe("Done");
    expect(columnName(synced, byTitle(synced, "Brand new issue"))).toBe("To do");
    // The second sync asked only for changes.
    const issueCalls = github.calls.filter((c) => c.path.startsWith(`/repos/${repo}/issues?`));
    expect(issueCalls.at(-1)!.path).toContain("since=");
  });

  it("paginates large repositories up to the sync limit", async () => {
    const repo = `acme/big-${++repoCounter}`;
    github.addRepo(repo);
    for (let i = 0; i < 250; i += 1) github.addItem(repo, { title: `Issue ${i}` });
    const { agent, board } = await newBoard();
    await link(agent, board.id, { repo });
    const synced = await getBoard(agent, board.id);
    expect(synced.cards).toHaveLength(200); // GITHUB_SYNC_ITEM_LIMIT default
    expect(github.calls.filter((c) => c.path.startsWith(`/repos/${repo}/issues`)).length).toBe(2);
  });

  it("needs a token for private repos, encrypts it, and never returns it", async () => {
    const repo = seedRepo({ private: true });
    const { agent, board } = await newBoard();

    const denied = await link(agent, board.id, { repo });
    expect(denied.status).toBe(404);
    expect(denied.body.error.code).toBe("repo_not_found");

    const bad = await link(agent, board.id, { repo, token: "nope" });
    expect(bad.status).toBe(404);

    const ok = await link(agent, board.id, { repo, token: READ_TOKEN });
    expect(ok.status).toBe(200);
    expect(JSON.stringify(ok.body)).not.toContain(READ_TOKEN);
    expect(ok.body.data.link).toMatchObject({ authMode: "token", canPush: true });

    const [row] = await t.database.db
      .select()
      .from(boardRepos)
      .where(eq(boardRepos.boardId, board.id));
    expect(row!.encryptedToken).toMatch(/^v1\./);
    expect(row!.encryptedToken).not.toContain(READ_TOKEN);
    expect((await getBoard(agent, board.id)).cards).toHaveLength(3);
  });

  it("refuses push-back without write access", async () => {
    const repo = seedRepo();
    const { agent, board } = await newBoard();
    const publicPush = await link(agent, board.id, { repo, pushEnabled: true });
    expect(publicPush.status).toBe(400);
    expect(publicPush.body.error.code).toBe("push_not_permitted");
    const readerPush = await link(agent, board.id, { repo, token: READ_TOKEN, pushEnabled: true });
    expect(readerPush.body.error.code).toBe("push_not_permitted");
  });

  it("records rate limiting as a sync error instead of failing silently", async () => {
    const repo = seedRepo();
    const { agent, board } = await newBoard();
    await link(agent, board.id, { repo });
    github.rateLimited = true;
    await agent.post(`/v1/boards/${board.id}/github/sync`).expect(202);
    await t.ctx.jobs!.idle();
    const linkStatus = (await status(agent, board.id)).link!;
    expect(linkStatus.syncStatus).toBe("error");
    expect(linkStatus.lastSyncError).toMatch(/rate limit/i);
  });

  it("keeps deleted cards deleted, and lets GitHub own linked titles", async () => {
    const repo = seedRepo();
    const { agent, board } = await newBoard();
    await link(agent, board.id, { repo });
    const card = byTitle(await getBoard(agent, board.id), "Dark mode");

    const edit = await agent
      .patch(`/v1/boards/${board.id}/cards/${card.id}`)
      .send({ title: "Mine now" })
      .expect(409);
    expect(edit.body.error.code).toBe("github_managed");

    await agent.delete(`/v1/boards/${board.id}/cards/${card.id}`).expect(200);
    github.update(repo, 2, { title: "Dark mode v2" });
    await agent.post(`/v1/boards/${board.id}/github/sync`).expect(202);
    await t.ctx.jobs!.idle();
    expect(byTitle(await getBoard(agent, board.id), "Dark mode v2")).toBeUndefined();
  });

  it("unlinking keeps the cards as plain cards", async () => {
    const repo = seedRepo();
    const { agent, board } = await newBoard();
    await link(agent, board.id, { repo });
    await agent.delete(`/v1/boards/${board.id}/github`).expect(204);
    const after = await getBoard(agent, board.id);
    expect(after.cards).toHaveLength(3);
    expect(after.cards.every((c) => c.github === null)).toBe(true);
    expect((await status(agent, board.id)).link).toBeNull();
  });
});

describe("webhooks", () => {
  it("rejects bad signatures and ignores redeliveries", async () => {
    const repo = seedRepo();
    const { agent, board } = await newBoard();
    await link(agent, board.id, { repo });
    const issue = github.addItem(repo, { title: "From webhook" });
    const payload = {
      action: "opened",
      repository: { full_name: repo },
      issue: github.issueJson(repo, issue),
    };

    const forged = await sendWebhook("issues", payload, randomUUID(), "wrong-secret-0000000000");
    expect(forged.status).toBe(401);

    const delivery = randomUUID();
    expect((await sendWebhook("issues", payload, delivery)).status).toBe(202);
    const again = await sendWebhook("issues", payload, delivery);
    expect(again.body).toEqual({ duplicate: true });

    const synced = await getBoard(agent, board.id);
    expect(synced.cards.filter((c) => c.title === "From webhook")).toHaveLength(1);
  });

  it("applies pull request merges and check results", async () => {
    const repo = seedRepo();
    const { agent, board } = await newBoard();
    await link(agent, board.id, { repo });

    github.checkRuns.set("abc123", [{ status: "completed", conclusion: "failure" }]);
    expect(
      (
        await sendWebhook("check_suite", {
          action: "completed",
          repository: { full_name: repo },
          check_suite: { head_sha: "abc123" },
        })
      ).status,
    ).toBe(202);
    expect(byTitle(await getBoard(agent, board.id), "Speed up login").github?.checksStatus).toBe(
      "failure",
    );

    const merged = github.update(repo, 3, { state: "closed", mergedAt: new Date().toISOString() });
    await sendWebhook("pull_request", {
      action: "closed",
      repository: { full_name: repo },
      pull_request: github.pullJson(repo, merged),
    });
    const pr = byTitle(await getBoard(agent, board.id), "Speed up login");
    expect(pr.github?.state).toBe("merged");
    expect(columnName(await getBoard(agent, board.id), pr)).toBe("Done");
  });

  it("ignores events older than what the board already has", async () => {
    const repo = seedRepo();
    const { agent, board } = await newBoard();
    const stale = github.issueJson(repo, github.repo(repo)!.items.get(1)!);
    github.update(repo, 1, { title: "Newer title" });
    await link(agent, board.id, { repo });

    await sendWebhook("issues", {
      action: "edited",
      repository: { full_name: repo },
      issue: { ...stale, title: "Stale title" },
    });
    expect(byTitle(await getBoard(agent, board.id), "Newer title")).toBeDefined();
  });
});

describe("push-back to GitHub (outbox)", () => {
  async function pushBoard() {
    const repo = seedRepo();
    const { agent, board } = await newBoard();
    const res = await link(agent, board.id, { repo, token: WRITE_TOKEN, pushEnabled: true });
    expect(res.body.data.link.pushEnabled).toBe(true);
    const done = board.columns.find((c) => c.name === "Done")!;
    const rule = await agent
      .put(`/v1/boards/${board.id}/github/rules/${done.id}`)
      .send({
        rule: { state: "closed", addLabels: ["shipped", "shipped"], removeLabels: ["perf"] },
      })
      .expect(200);
    expect(rule.body.data.githubRule).toEqual({
      state: "closed",
      addLabels: ["shipped"],
      removeLabels: ["perf"],
    });
    return { repo, agent, boardId: board.id, done: done.id };
  }

  it("closes and relabels the GitHub issue when a card moves into a rule column", async () => {
    const { repo, agent, boardId, done } = await pushBoard();
    const card = byTitle(await getBoard(agent, boardId), "Login is slow");

    await agent
      .post(`/v1/boards/${boardId}/cards/${card.id}/move`)
      .send({ toColumnId: done, prevCardId: null, nextCardId: null })
      .expect(200);
    await t.ctx.jobs!.idle();

    const remote = github.repo(repo)!.items.get(1)!;
    expect(remote.state).toBe("closed");
    expect(remote.labels.sort()).toEqual(["bug", "shipped"]);
    expect((await status(agent, boardId)).link).toMatchObject({
      pendingPushes: 0,
      failedPushes: 0,
    });

    // GitHub's echo of our own change must not bounce the card back.
    await sendWebhook("issues", {
      action: "closed",
      repository: { full_name: repo },
      issue: github.issueJson(repo, remote),
    });
    const after = await getBoard(agent, boardId);
    expect(columnName(after, byTitle(after, "Login is slow"))).toBe("Done");
  });

  it("retries transient failures and gives up on permanent ones", async () => {
    const { repo, agent, boardId, done } = await pushBoard();
    const board = await getBoard(agent, boardId);

    github.failures.push({ method: "PATCH", pattern: /\/issues\/1$/, status: 502, remaining: 1 });
    await agent
      .post(`/v1/boards/${boardId}/cards/${byTitle(board, "Login is slow").id}/move`)
      .send({ toColumnId: done, prevCardId: null, nextCardId: null })
      .expect(200);
    await t.ctx.jobs!.idle();

    const [row] = await t.database.db
      .select()
      .from(githubOutbox)
      .where(eq(githubOutbox.boardId, boardId));
    expect(row).toMatchObject({ attempts: 1, completedAt: null, failedAt: null });
    expect(row!.lastError).toContain("502");
    expect((await status(agent, boardId)).link!.pendingPushes).toBe(1);

    // Pretend the backoff elapsed.
    await t.database.db
      .update(githubOutbox)
      .set({ nextAttemptAt: sql`now()` })
      .where(eq(githubOutbox.id, row!.id));
    t.ctx.jobs!.kick();
    await t.ctx.jobs!.idle();
    expect(github.repo(repo)!.items.get(1)!.state).toBe("closed");

    github.failures.push({ method: "PATCH", pattern: /\/issues\/2$/, status: 404 });
    await agent
      .post(`/v1/boards/${boardId}/cards/${byTitle(board, "Dark mode").id}/move`)
      .send({ toColumnId: done, prevCardId: null, nextCardId: null })
      .expect(200);
    await t.ctx.jobs!.idle();
    expect((await status(agent, boardId)).link!.failedPushes).toBe(1);
  });

  it("only admins configure rules, and maintainers can still trigger syncs", async () => {
    const { agent, boardId, done } = await pushBoard();
    const maintainer = await signUp(t.app, "Max Maintainer");
    await agent
      .post(`/v1/boards/${boardId}/members`)
      .send({ email: maintainer.email, role: "MAINTAINER" })
      .expect(201);

    await maintainer.agent
      .put(`/v1/boards/${boardId}/github/rules/${done}`)
      .send({ rule: null })
      .expect(403);
    await maintainer.agent.put(`/v1/boards/${boardId}/github`).send({ repo: "acme/x" }).expect(403);
    await maintainer.agent.post(`/v1/boards/${boardId}/github/sync`).expect(202);
    await t.ctx.jobs!.idle();
  });
});

describe("demo boards", () => {
  it("report demo mode and refuse to sync", async () => {
    const demo = await signInDemo(t.app);
    const linkStatus = (await status(demo.agent, demo.admin.id)).link!;
    expect(linkStatus).toMatchObject({ authMode: "demo", owner: "devsync", name: "devsync" });
    const res = await demo.agent.post(`/v1/boards/${demo.admin.id}/github/sync`).expect(409);
    expect(res.body.error.code).toBe("demo_repo");
  });

  it("keep sample cards editable, since no real GitHub item backs them", async () => {
    const demo = await signInDemo(t.app);
    const board = await getBoard(demo.agent, demo.admin.id);
    expect(board.repo).toEqual({ owner: "devsync", name: "devsync", demo: true });
    const sample = board.cards.find((c) => c.github)!;
    await demo.agent
      .patch(`/v1/boards/${board.id}/cards/${sample.id}`)
      .send({ title: "Edited sample" })
      .expect(200);
  });
});

describe("GitHub App", () => {
  it("links through an installation token when the App is installed", async () => {
    const { privateKey } = generateKeyPairSync("rsa", {
      modulusLength: 2048,
      privateKeyEncoding: { type: "pkcs1", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    const appGitHub = new FakeGitHub();
    appGitHub.addRepo("acme/installed", { private: true, installationId: 77 });
    appGitHub.addItem("acme/installed", { title: "Private issue" });
    const appCtx = await createTestApp(
      {
        GITHUB_API_URL: FAKE_GITHUB_URL,
        GITHUB_APP_ID: "123",
        // Escaped newlines, as single-line env files store them.
        GITHUB_APP_PRIVATE_KEY: privateKey.replace(/\n/g, "\\n"),
      },
      appGitHub.fetch,
    );
    const { agent } = await signUp(appCtx.app);
    const boardId = (await agent.post("/v1/boards").send({ name: "App" }).expect(201)).body.data.id;

    const res = await agent
      .put(`/v1/boards/${boardId}/github`)
      .send({ repo: "acme/installed", pushEnabled: true })
      .expect(200);
    await appCtx.ctx.jobs!.idle();
    expect(res.body.data).toMatchObject({
      appConfigured: true,
      link: { authMode: "app", pushEnabled: true },
    });
    expect((await getBoard(agent, boardId)).cards.map((c) => c.title)).toEqual(["Private issue"]);
    expect(appGitHub.calls.some((c) => c.token === "ghs_installation_77")).toBe(true);
    // The app JWT is RS256 and only used for app endpoints.
    const jwtCall = appGitHub.calls.find((c) => c.path.endsWith("/installation"))!;
    expect(
      JSON.parse(Buffer.from(jwtCall.token!.split(".")[0]!, "base64url").toString()),
    ).toMatchObject({ alg: "RS256" });
    await appCtx.close();
  });
});

describe("column rules", () => {
  it("normalizes empty rules to null and validates input", async () => {
    const { agent, board } = await newBoard();
    const column = columnIds(board)[0]!;
    const empty = await agent
      .put(`/v1/boards/${board.id}/github/rules/${column}`)
      .send({ rule: { addLabels: [] } })
      .expect(200);
    expect(empty.body.data.githubRule).toBeNull();
    await agent
      .put(`/v1/boards/${board.id}/github/rules/${column}`)
      .send({ rule: { state: "archived" } })
      .expect(400);
  });
});
