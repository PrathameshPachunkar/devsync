import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config";
import { cookieValue, createTestApp, ORIGIN, type TestContext } from "./helpers";

/**
 * Deployment behind the web app's same-origin proxy: the browser calls
 * https://app.example/api/v1/..., and Vercel forwards to the API's /v1/....
 */
let t: TestContext;
beforeAll(async () => {
  t = await createTestApp({
    API_PUBLIC_URL: `${ORIGIN}/api`,
    GITHUB_CLIENT_ID: "id",
    GITHUB_CLIENT_SECRET: "secret",
  });
});
afterAll(() => t.close());

const setCookies = (res: request.Response) => res.headers["set-cookie"] as unknown as string[];

describe("behind the /api proxy", () => {
  it("scopes cookies to the paths the browser actually requests", async () => {
    const res = await request(t.app).post("/v1/auth/demo").set("Origin", ORIGIN).expect(201);
    const cookies = setCookies(res);
    expect(cookies.find((c) => c.startsWith("devsync_rt="))).toMatch(/Path=\/api\/v1\/auth;/);
    expect(cookies.find((c) => c.startsWith("devsync_at="))).toMatch(/Path=\/;/);
    expect(cookies.find((c) => c.startsWith("devsync_session="))).toMatch(/Path=\/;/);

    // The refresh endpoint itself is unchanged. Only the browser-facing path moved.
    const refreshed = await request(t.app)
      .post("/v1/auth/refresh")
      .set("Origin", ORIGIN)
      .set("Cookie", `devsync_rt=${cookieValue(cookies, "devsync_rt")}`)
      .expect(200);
    expect(setCookies(refreshed).find((c) => c.startsWith("devsync_rt="))).toMatch(
      /Path=\/api\/v1\/auth;/,
    );
  });

  it("sends GitHub back through the proxy and scopes the OAuth state cookie", async () => {
    const res = await request(t.app).get("/v1/auth/github").expect(302);
    const authorize = new URL(res.headers.location!);
    expect(authorize.searchParams.get("redirect_uri")).toBe(
      `${ORIGIN}/api/v1/auth/github/callback`,
    );
    expect(setCookies(res).find((c) => c.startsWith("devsync_oauth="))).toMatch(
      /Path=\/api\/v1\/auth\/github;/,
    );
  });
});

describe("config", () => {
  it("derives the cookie prefix from API_PUBLIC_URL", () => {
    expect(loadConfig({ API_PUBLIC_URL: "https://api.example.com" }).apiBasePath).toBe("");
    expect(loadConfig({ API_PUBLIC_URL: "https://app.example.com/api/" }).apiBasePath).toBe("/api");
  });

  it("accepts true, false, or a proxy hop count for TRUST_PROXY", () => {
    expect(loadConfig({ TRUST_PROXY: "2" }).trustProxy).toBe(2);
    expect(loadConfig({ TRUST_PROXY: "true" }).trustProxy).toBe(true);
    expect(loadConfig({}).trustProxy).toBe(false);
    expect(() => loadConfig({ TRUST_PROXY: "yes" })).toThrow(/TRUST_PROXY/);
  });
});
