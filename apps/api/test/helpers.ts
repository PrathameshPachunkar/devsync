import { randomUUID } from "node:crypto";

import { createPgliteDatabase, createPostgresDatabase, type DatabaseHandle } from "@devsync/db";
import type { BoardDto, BoardSummaryDto } from "@devsync/shared";
import type { Express } from "express";
import request from "supertest";

import { createApp } from "../src/app";
import { loadConfig, type AppConfig } from "../src/config";
import type { AppContext } from "../src/context";
import { createContext } from "../src/create-context";
import { createLogger } from "../src/lib/logger";

export const ORIGIN = "http://localhost:3000";

export interface TestContext {
  app: Express;
  ctx: AppContext;
  database: DatabaseHandle;
  close: () => Promise<void>;
}

/**
 * A fresh app on its own in-memory Postgres (PGlite). Set TEST_DATABASE_URL to
 * run the same suite through node-postgres against a real server instead
 * (CI uses a Postgres service). Tests create unique users and boards, so a
 * shared database is safe.
 */
export async function createTestApp(
  env: Record<string, string> = {},
  fetchImpl?: typeof fetch,
): Promise<TestContext> {
  const config: AppConfig = loadConfig({
    NODE_ENV: "test",
    JWT_SECRET: "test-secret-that-is-at-least-32-characters-long",
    WEB_ORIGINS: ORIGIN,
    AUTH_RATE_LIMIT: "1000",
    ...env,
  });
  const url = process.env.TEST_DATABASE_URL;
  const database = url
    ? createPostgresDatabase(url, Number(process.env.TEST_DATABASE_POOL_SIZE ?? 5))
    : createPgliteDatabase();
  await database.migrate();
  const ctx = createContext(config, database, createLogger(config), fetchImpl);
  return { app: createApp(ctx), ctx, database, close: database.close };
}

/** A cookie-keeping client that behaves like the web app (same Origin on every request). */
export function client(app: Express) {
  const agent = request.agent(app);
  agent.set("Origin", ORIGIN);
  return agent;
}
export type Client = ReturnType<typeof client>;

export async function signUp(app: Express, name = "Test User") {
  const agent = client(app);
  const email = `${randomUUID()}@example.test`;
  const res = await agent
    .post("/v1/auth/register")
    .send({ name, email, password: "correct horse battery" })
    .expect(201);
  return { agent, email, user: res.body.user as { id: string; name: string } };
}

export async function signInDemo(app: Express) {
  const agent = client(app);
  const res = await agent.post("/v1/auth/demo").expect(201);
  const boards = (await agent.get("/v1/boards").expect(200)).body.data as BoardSummaryDto[];
  const byName = (name: string) => boards.find((b) => b.name === name)!;
  return {
    agent,
    user: res.body.user as { id: string },
    admin: byName("DevSync Core"),
    maintainer: byName("Mobile App"),
    viewer: byName("Marketing Site"),
  };
}

export async function getBoard(agent: Client, boardId: string): Promise<BoardDto> {
  return (await agent.get(`/v1/boards/${boardId}`).expect(200)).body.data as BoardDto;
}

export function idsIn(board: BoardDto, columnId: string): string[] {
  return board.cards
    .filter((c) => c.columnId === columnId)
    .sort((a, b) => (a.position < b.position ? -1 : 1))
    .map((c) => c.id);
}

export function columnIds(board: BoardDto): string[] {
  return [...board.columns].sort((a, b) => (a.position < b.position ? -1 : 1)).map((c) => c.id);
}

/** Pulls `name=value` for a cookie out of a Set-Cookie header list. */
export function cookieValue(setCookie: string[] | string | undefined, name: string) {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const match = list.find((c) => c.startsWith(`${name}=`));
  return match?.split(";")[0]?.slice(name.length + 1);
}
