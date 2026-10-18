import request from "supertest";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { client, cookieValue, createTestApp, ORIGIN, signUp, type TestContext } from "./helpers";

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp();
});
afterAll(() => t.close());
afterEach(() => {
  vi.useRealTimers();
});

const refreshWith = (token: string) =>
  request(t.app)
    .post("/v1/auth/refresh")
    .set("Origin", ORIGIN)
    .set("Cookie", `devsync_rt=${token}`);

describe("registration and login", () => {
  it("registers, sets httpOnly session cookies, and creates a starter board", async () => {
    const agent = client(t.app);
    const res = await agent
      .post("/v1/auth/register")
      .send({ name: "Ada", email: "ADA@Example.test ", password: "correct horse battery" })
      .expect(201);

    expect(res.body.user).toMatchObject({ name: "Ada", email: "ada@example.test", isGuest: false });
    expect(res.body.accessToken).toEqual(expect.any(String));
    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.find((c) => c.startsWith("devsync_at="))).toMatch(/HttpOnly/i);
    expect(cookies.find((c) => c.startsWith("devsync_rt="))).toMatch(/Path=\/v1\/auth/);
    expect(cookies.join(";")).toMatch(/SameSite=Lax/i);
    // The readable hint cookie carries no secret.
    expect(cookies.find((c) => c.startsWith("devsync_session="))).toMatch(/^devsync_session=1;/);
    expect(cookies.find((c) => c.startsWith("devsync_session="))).not.toMatch(/HttpOnly/i);

    const boards = await agent.get("/v1/boards").expect(200);
    expect(boards.body.data).toHaveLength(1);
    expect(boards.body.data[0]).toMatchObject({ name: "My first board", role: "ADMIN" });
  });

  it("rejects duplicate emails and weak passwords", async () => {
    const { email } = await signUp(t.app);
    const dup = await client(t.app)
      .post("/v1/auth/register")
      .send({ name: "Copy", email, password: "correct horse battery" })
      .expect(409);
    expect(dup.body.error.code).toBe("email_taken");

    const weak = await client(t.app)
      .post("/v1/auth/register")
      .send({ name: "W", email: "weak@example.test", password: "short" })
      .expect(400);
    expect(weak.body.error).toMatchObject({ code: "validation_failed" });
    expect(weak.body.error.details[0].path).toBe("password");
  });

  it("logs in with the right password and gives one error for every failure", async () => {
    const { email } = await signUp(t.app);
    await client(t.app)
      .post("/v1/auth/login")
      .send({ email, password: "correct horse battery" })
      .expect(200);

    const wrong = await client(t.app)
      .post("/v1/auth/login")
      .send({ email, password: "nope nope nope" })
      .expect(401);
    const unknown = await client(t.app)
      .post("/v1/auth/login")
      .send({ email: "nobody@example.test", password: "nope nope nope" })
      .expect(401);
    expect(wrong.body.error).toEqual(unknown.body.error);
  });

  it("serves /me with the cookie or a bearer token, and 401s without one", async () => {
    const { agent } = await signUp(t.app, "Grace");
    expect((await agent.get("/v1/auth/me").expect(200)).body.user.name).toBe("Grace");

    const login = await agent.post("/v1/auth/demo").expect(201);
    await request(t.app)
      .get("/v1/auth/me")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .expect(200);

    const anonymous = await request(t.app).get("/v1/auth/me").expect(401);
    expect(anonymous.body.error.code).toBe("unauthenticated");
    const forged = await request(t.app)
      .get("/v1/auth/me")
      .set("Authorization", "Bearer not.a.jwt")
      .expect(401);
    expect(forged.body.error.code).toBe("invalid_token");
  });

  it("reports expired access tokens distinctly so clients know to refresh", async () => {
    const login = await client(t.app).post("/v1/auth/demo").expect(201);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 16 * 60 * 1000);
    // Bearer header: a cookie jar would silently drop the expired cookie.
    const res = await request(t.app)
      .get("/v1/auth/me")
      .set("Authorization", `Bearer ${login.body.accessToken}`)
      .expect(401);
    expect(res.body.error.code).toBe("token_expired");
  });
});

describe("refresh token rotation", () => {
  async function login() {
    const res = await client(t.app).post("/v1/auth/demo").expect(201);
    return cookieValue(res.headers["set-cookie"], "devsync_rt")!;
  }

  it("rotates: each refresh returns a new token and invalidates the old one", async () => {
    const first = await login();
    const res = await refreshWith(first).expect(200);
    const second = cookieValue(res.headers["set-cookie"], "devsync_rt")!;
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    await refreshWith(second).expect(200);
  });

  it("treats a near-simultaneous reuse as a race, not theft", async () => {
    const first = await login();
    const res = await refreshWith(first).expect(200);
    const second = cookieValue(res.headers["set-cookie"], "devsync_rt")!;

    const raced = await refreshWith(first).expect(401);
    expect(raced.body.error.code).toBe("token_rotated");
    // The family survives, so the winning tab stays signed in.
    await refreshWith(second).expect(200);
  });

  it("revokes the whole family when an old token is replayed later", async () => {
    const first = await login();
    const res = await refreshWith(first).expect(200);
    const second = cookieValue(res.headers["set-cookie"], "devsync_rt")!;

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 60_000);
    const replay = await refreshWith(first).expect(401);
    expect(replay.body.error.code).toBe("token_reused");
    // The legitimate holder is logged out too, so a thief can't keep a copy.
    const victim = await refreshWith(second).expect(401);
    expect(victim.body.error.code).toBe("token_reused");
  });

  it("rejects unknown and expired refresh tokens", async () => {
    expect((await refreshWith("garbage").expect(401)).body.error.code).toBe(
      "invalid_refresh_token",
    );
    const token = await login();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 15 * 86_400_000);
    expect((await refreshWith(token).expect(401)).body.error.code).toBe("session_expired");
  });

  it("logout revokes the session and clears cookies", async () => {
    const token = await login();
    const res = await request(t.app)
      .post("/v1/auth/logout")
      .set("Origin", ORIGIN)
      .set("Cookie", `devsync_rt=${token}`)
      .expect(204);
    expect((res.headers["set-cookie"] as unknown as string[]).join(";")).toMatch(/devsync_at=;/);
    await refreshWith(token).expect(401);
  });
});

describe("demo sandbox", () => {
  it("gives each visitor private copies of the demo boards with mixed roles", async () => {
    const a = client(t.app);
    const b = client(t.app);
    await a.post("/v1/auth/demo").expect(201);
    await b.post("/v1/auth/demo").expect(201);
    const boardsA = (await a.get("/v1/boards").expect(200)).body.data;
    const boardsB = (await b.get("/v1/boards").expect(200)).body.data;

    expect(boardsA.map((x: { role: string }) => x.role)).toEqual(["ADMIN", "MAINTAINER", "VIEWER"]);
    expect(boardsA[0].openCardCount).toBe(90);
    // Separate sandboxes: no shared board ids.
    const idsA = new Set(boardsA.map((x: { id: string }) => x.id));
    expect(boardsB.some((x: { id: string }) => idsA.has(x.id))).toBe(false);

    const board = (await a.get(`/v1/boards/${boardsA[0].id}`).expect(200)).body.data;
    expect(board.cards).toHaveLength(120);
    expect(board.cards.some((c: { github: unknown }) => c.github)).toBe(true);
    expect(board.repo).toEqual({ owner: "devsync", name: "devsync" });
  });

  it("can be switched off", async () => {
    const off = await createTestApp({ DEMO_ENABLED: "false" });
    await client(off.app).post("/v1/auth/demo").expect(404);
    expect((await request(off.app).get("/v1/auth/providers")).body).toEqual({
      password: true,
      github: false,
      demo: false,
    });
    await off.close();
  });
});
