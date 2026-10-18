import { loginSchema, registerSchema, type AuthProvidersDto } from "@devsync/shared";
import { Router, type Request, type Response } from "express";

import type { AppContext } from "../../context";
import { badRequest, HttpError, parse, unauthorized } from "../../lib/http-error";
import { authenticate, requireAuth } from "../../middleware/authenticate";
import { authRateLimit } from "../../middleware/rate-limit";
import { getUser, loginUser, registerUser, toSessionUser } from "./auth.service";
import {
  clearSessionCookies,
  OAUTH_STATE_COOKIE,
  oauthStateCookieOptions,
  REFRESH_COOKIE,
  setSessionCookies,
} from "./cookies";
import { createDemoSandbox } from "./demo.service";
import {
  authorizeUrl,
  createOAuthState,
  fetchGitHubProfile,
  safeNextPath,
  statesMatch,
  upsertGitHubUser,
} from "./github-oauth";
import type { IssuedSession } from "./session.service";

export function authRouter(ctx: AppContext): Router {
  const { config, db, sessions } = ctx;
  const router = Router();
  const limited = authRateLimit(config.authRateLimit);

  /** Sets cookies for browsers and also returns the access token for API clients. */
  const respondWithSession = async (res: Response, session: IssuedSession, status = 200) => {
    setSessionCookies(res, config, session);
    const user = await getUser(db, session.userId);
    res.status(status).json({
      user: toSessionUser(user),
      accessToken: session.accessToken,
      expiresIn: config.accessTokenTtlSeconds,
    });
  };

  router.get("/providers", (_req, res) => {
    const providers: AuthProvidersDto = {
      password: true,
      github: config.github !== null,
      demo: config.demoEnabled,
    };
    res.json(providers);
  });

  router.post("/register", limited, async (req: Request, res) => {
    const input = parse(registerSchema, req.body);
    const user = await registerUser(db, input);
    await respondWithSession(res, await sessions.issue(user.id, req.get("user-agent")), 201);
  });

  router.post("/login", limited, async (req, res) => {
    const input = parse(loginSchema, req.body);
    const user = await loginUser(db, input);
    await respondWithSession(res, await sessions.issue(user.id, req.get("user-agent")));
  });

  router.post("/demo", limited, async (req, res) => {
    if (!config.demoEnabled) throw new HttpError(404, "demo_disabled", "The demo is turned off");
    const guest = await createDemoSandbox(db);
    await respondWithSession(res, await sessions.issue(guest.id, req.get("user-agent")), 201);
  });

  router.post("/refresh", async (req, res) => {
    const token: unknown = req.cookies?.[REFRESH_COOKIE];
    if (typeof token !== "string" || !token) throw unauthorized("no_session", "Not signed in");
    try {
      await respondWithSession(res, await sessions.rotate(token, req.get("user-agent")));
    } catch (error) {
      // A concurrent refresh already replaced the cookie. Keep it.
      if (!(error instanceof HttpError && error.code === "token_rotated")) {
        clearSessionCookies(res, config);
      }
      throw error;
    }
  });

  router.post("/logout", async (req, res) => {
    const token: unknown = req.cookies?.[REFRESH_COOKIE];
    if (typeof token === "string" && token) await sessions.revoke(token);
    clearSessionCookies(res, config);
    res.status(204).end();
  });

  router.get("/me", authenticate(ctx.tokens), async (req, res) => {
    const user = await getUser(db, requireAuth(req).userId);
    res.json({ user: toSessionUser(user) });
  });

  /* ------------------------------------------------------ GitHub OAuth */

  router.get("/github", limited, (req, res) => {
    if (!config.github) throw new HttpError(404, "github_disabled", "GitHub sign-in is not set up");
    const state = createOAuthState();
    const next = safeNextPath(req.query.next);
    res.cookie(
      OAUTH_STATE_COOKIE,
      `${state}.${encodeURIComponent(next)}`,
      oauthStateCookieOptions(config),
    );
    res.redirect(302, authorizeUrl(config.github, config.apiPublicUrl, state));
  });

  router.get("/github/callback", async (req, res) => {
    const fail = (reason: string) =>
      res.redirect(302, `${config.webUrl}/login?error=${encodeURIComponent(reason)}`);
    if (!config.github) return fail("github_disabled");

    const cookie: unknown = req.cookies?.[OAUTH_STATE_COOKIE];
    res.clearCookie(OAUTH_STATE_COOKIE, oauthStateCookieOptions(config));
    const [expectedState, encodedNext] = typeof cookie === "string" ? cookie.split(".") : [];
    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    const code = typeof req.query.code === "string" ? req.query.code : undefined;

    if (typeof req.query.error === "string") return fail("github_denied");
    if (!statesMatch(expectedState, state)) return fail("oauth_state_mismatch");
    if (!code) throw badRequest("oauth_failed", "Missing authorization code");

    const profile = await fetchGitHubProfile(ctx.fetch, config.github, code);
    const user = await upsertGitHubUser(db, profile);
    setSessionCookies(res, config, await sessions.issue(user.id, req.get("user-agent")));
    res.redirect(302, `${config.webUrl}${safeNextPath(decodeURIComponent(encodedNext ?? ""))}`);
  });

  return router;
}
