import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { client, cookieValue, createTestApp, signUp, type TestContext } from "./helpers";

/** Stands in for github.com and api.github.com. */
function fakeGitHub(profile: { id: number; login: string; email: string | null }) {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
    if (url.endsWith("/login/oauth/access_token")) return json({ access_token: "gho_test" });
    if (url.endsWith("/user")) {
      return json({
        id: profile.id,
        login: profile.login,
        name: null,
        avatar_url: "https://a/x.png",
      });
    }
    if (url.endsWith("/user/emails")) {
      return json(profile.email ? [{ email: profile.email, primary: true, verified: true }] : []);
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
}

let t: TestContext;
const profile = { id: 4242, login: "octocat", email: null as string | null };

beforeAll(async () => {
  t = await createTestApp(
    {
      GITHUB_CLIENT_ID: "client-id",
      GITHUB_CLIENT_SECRET: "client-secret",
      WEB_URL: "http://web.test",
    },
    // Reads `profile` at call time, so tests can change it.
    ((...args: Parameters<typeof fetch>) => fakeGitHub(profile)(...args)) as typeof fetch,
  );
});
afterAll(() => t.close());

async function startFlow(next = "/boards") {
  const res = await request(t.app)
    .get(`/v1/auth/github?next=${encodeURIComponent(next)}`)
    .expect(302);
  const location = new URL(res.headers.location!);
  expect(location.origin).toBe("https://github.com");
  return {
    state: location.searchParams.get("state")!,
    cookie: `devsync_oauth=${cookieValue(res.headers["set-cookie"], "devsync_oauth")}`,
  };
}

describe("Sign in with GitHub", () => {
  it("advertises the provider when configured", async () => {
    expect((await request(t.app).get("/v1/auth/providers")).body.github).toBe(true);
  });

  it("creates an account and returns to the requested page", async () => {
    const { state, cookie } = await startFlow("/boards?from=login");
    const res = await request(t.app)
      .get(`/v1/auth/github/callback?code=abc&state=${state}`)
      .set("Cookie", cookie)
      .expect(302);
    expect(res.headers.location).toBe("http://web.test/boards?from=login");

    const access = cookieValue(res.headers["set-cookie"], "devsync_at")!;
    const me = await request(t.app)
      .get("/v1/auth/me")
      .set("Cookie", `devsync_at=${access}`)
      .expect(200);
    expect(me.body.user).toMatchObject({ name: "octocat", githubLogin: "octocat" });
  });

  it("rejects a forged or missing state", async () => {
    const { cookie } = await startFlow();
    const res = await request(t.app)
      .get("/v1/auth/github/callback?code=abc&state=forged")
      .set("Cookie", cookie)
      .expect(302);
    expect(res.headers.location).toBe("http://web.test/login?error=oauth_state_mismatch");
    expect(cookieValue(res.headers["set-cookie"], "devsync_at")).toBeUndefined();
  });

  it("never redirects off-site", async () => {
    const { state, cookie } = await startFlow("//evil.example/steal");
    const res = await request(t.app)
      .get(`/v1/auth/github/callback?code=abc&state=${state}`)
      .set("Cookie", cookie)
      .expect(302);
    expect(res.headers.location).toBe("http://web.test/boards");
  });

  it("links to an existing password account with the same verified email", async () => {
    const existing = await signUp(t.app, "Ada");
    profile.id = 777;
    profile.login = "ada-gh";
    profile.email = existing.email;

    const { state, cookie } = await startFlow();
    const res = await request(t.app)
      .get(`/v1/auth/github/callback?code=abc&state=${state}`)
      .set("Cookie", cookie)
      .expect(302);
    const access = cookieValue(res.headers["set-cookie"], "devsync_at")!;
    const me = await request(t.app)
      .get("/v1/auth/me")
      .set("Cookie", `devsync_at=${access}`)
      .expect(200);
    expect(me.body.user.id).toBe(existing.user.id);
    expect(me.body.user.githubLogin).toBe("ada-gh");
  });

  it("is a 404 when GitHub is not configured", async () => {
    const plain = await createTestApp();
    await client(plain.app).get("/v1/auth/github").expect(404);
    await plain.close();
  });
});
