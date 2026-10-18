import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp, ORIGIN, signInDemo, type TestContext } from "./helpers";

let t: TestContext;
beforeAll(async () => {
  t = await createTestApp({ AUTH_RATE_LIMIT: "5" });
});
afterAll(() => t.close());

describe("security", () => {
  it("blocks cookie-authenticated writes from other origins (CSRF)", async () => {
    const { agent, admin } = await signInDemo(t.app);
    const res = await agent
      .post(`/v1/boards/${admin.id}/columns`)
      .set("Origin", "https://evil.example")
      .send({ name: "pwned" })
      .expect(403);
    expect(res.body.error.code).toBe("origin_not_allowed");

    // A session cookie with no Origin at all is refused too.
    const cookies = (await agent.post("/v1/auth/demo")).headers[
      "set-cookie"
    ] as unknown as string[];
    await request(t.app)
      .post(`/v1/boards/${admin.id}/columns`)
      .set("Cookie", cookies.map((c) => c.split(";")[0]).join("; "))
      .send({ name: "x" })
      .expect(403);
  });

  it("allows reads from anywhere and CORS only for the web origin", async () => {
    const preflight = await request(t.app)
      .options("/v1/boards")
      .set("Origin", ORIGIN)
      .set("Access-Control-Request-Method", "POST");
    expect(preflight.headers["access-control-allow-origin"]).toBe(ORIGIN);
    expect(preflight.headers["access-control-allow-credentials"]).toBe("true");

    const foreign = await request(t.app).get("/health").set("Origin", "https://evil.example");
    expect(foreign.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("sends security headers and hides the framework", async () => {
    const res = await request(t.app).get("/health").expect(200);
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["strict-transport-security"]).toBeDefined();
  });

  it("rate-limits credential endpoints", async () => {
    const attempt = () =>
      request(t.app)
        .post("/v1/auth/login")
        .set("Origin", ORIGIN)
        .send({ email: "brute@example.test", password: "guess guess guess" });
    // The demo sign-in above already used part of the window.
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) statuses.push((await attempt()).status);
    expect(statuses).toContain(429);
    const limited = await attempt();
    expect(limited.body.error.code).toBe("rate_limited");
  });

  it("returns JSON errors for bad JSON, unknown routes, and huge bodies", async () => {
    const badJson = await request(t.app)
      .post("/v1/auth/login")
      .set("Origin", ORIGIN)
      .set("Content-Type", "application/json")
      .send("{not json")
      .expect(400);
    expect(badJson.body.error.code).toBe("invalid_json");

    const missing = await request(t.app).get("/v1/nope").expect(404);
    expect(missing.body.error.code).toBe("route_not_found");

    const huge = await request(t.app)
      .post("/v1/auth/register")
      .set("Origin", ORIGIN)
      .send({ name: "x".repeat(200_000) })
      .expect(413);
    expect(huge.body.error.code).toBe("payload_too_large");
  });
});
