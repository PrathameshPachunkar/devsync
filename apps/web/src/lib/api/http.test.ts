import { afterEach, describe, expect, it, vi } from "vitest";

import { safeNext } from "@/features/auth/api";

import { API_URL, apiFetch, ApiError, hasSessionHint } from "./http";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function mockFetch(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn((input: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(handler(String(input), init ?? {})),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch", () => {
  it("sends JSON with cookie credentials", async () => {
    const fetchFn = mockFetch(() => json(200, { ok: true }));
    await expect(apiFetch("/v1/x", { method: "POST", body: { a: 1 } })).resolves.toEqual({
      ok: true,
    });
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(`${API_URL}/v1/x`);
    expect(init).toMatchObject({ method: "POST", credentials: "include", body: '{"a":1}' });
  });

  it("turns error bodies into ApiError", async () => {
    mockFetch(() => json(403, { error: { code: "forbidden", message: "Viewers can't do that" } }));
    const error = await apiFetch("/v1/x").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 403,
      code: "forbidden",
      message: "Viewers can't do that",
    });
  });

  it("refreshes once on 401 and retries the request", async () => {
    let authed = false;
    const fetchFn = mockFetch((url) => {
      if (url.endsWith("/v1/auth/refresh")) {
        authed = true;
        return json(200, {});
      }
      return authed
        ? json(200, { data: 1 })
        : json(401, { error: { code: "token_expired", message: "" } });
    });
    await expect(apiFetch("/v1/boards")).resolves.toEqual({ data: 1 });
    expect(fetchFn.mock.calls.map(([u]) => String(u).replace(API_URL, ""))).toEqual([
      "/v1/boards",
      "/v1/auth/refresh",
      "/v1/boards",
    ]);
  });

  it("shares a single refresh between concurrent failures", async () => {
    let authed = false;
    const fetchFn = mockFetch(async (url) => {
      if (url.endsWith("/v1/auth/refresh")) {
        await new Promise((r) => setTimeout(r, 10));
        authed = true;
        return json(200, {});
      }
      return authed ? json(200, {}) : json(401, { error: { code: "token_expired", message: "" } });
    });
    await Promise.all([apiFetch("/v1/a"), apiFetch("/v1/b"), apiFetch("/v1/c")]);
    const refreshes = fetchFn.mock.calls.filter(([u]) => String(u).endsWith("/refresh"));
    expect(refreshes).toHaveLength(1);
  });

  it("gives up when the refresh fails", async () => {
    mockFetch((url) =>
      url.endsWith("/refresh")
        ? json(401, { error: { code: "session_expired", message: "" } })
        : json(401, { error: { code: "token_expired", message: "Expired" } }),
    );
    await expect(apiFetch("/v1/boards")).rejects.toMatchObject({ status: 401 });
  });

  it("never refreshes for auth endpoints that opt out", async () => {
    const fetchFn = mockFetch(() =>
      json(401, { error: { code: "invalid_credentials", message: "" } }),
    );
    await expect(apiFetch("/v1/auth/login", { skipRefresh: true })).rejects.toBeInstanceOf(
      ApiError,
    );
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});

describe("redirect and cookie helpers", () => {
  it("only follows same-site relative paths", () => {
    expect(safeNext("/boards/abc?x=1")).toBe("/boards/abc?x=1");
    expect(safeNext("//evil.example")).toBe("/boards");
    expect(safeNext("https://evil.example")).toBe("/boards");
    expect(safeNext(null)).toBe("/boards");
  });

  it("detects the session hint cookie", () => {
    expect(hasSessionHint("a=1; devsync_session=1")).toBe(true);
    expect(hasSessionHint("devsync_sessionx=1")).toBe(false);
    expect(hasSessionHint(undefined)).toBe(false);
  });
});
