import type { CookieOptions, Response } from "express";

import type { AppConfig } from "../../config";
import type { IssuedSession } from "./session.service";

export const ACCESS_COOKIE = "devsync_at";
export const REFRESH_COOKIE = "devsync_rt";
export const OAUTH_STATE_COOKIE = "devsync_oauth";
/**
 * Readable, non-secret hint that a session probably exists. Pages can't see
 * the refresh cookie (its path is the auth API), so the web app's route
 * guard uses this to choose between rendering and redirecting to /login.
 * It grants nothing: every API call is still authorized by the httpOnly tokens.
 */
export const SESSION_HINT_COOKIE = "devsync_session";

/**
 * Cookie paths are what the browser sees. Behind the web app's /api proxy,
 * the browser requests /api/v1/auth/..., so the paths carry that prefix.
 */
const authPath = (config: AppConfig) => `${config.apiBasePath}/v1/auth`;

/** The refresh token is only ever sent to the auth routes. */
export const refreshCookiePath = authPath;

function base(config: AppConfig): CookieOptions {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    // Lax, plus the Origin check on writes, covers CSRF. Strict would drop
    // the cookie on the first navigation from another site.
    sameSite: "lax",
    ...(config.cookieDomain ? { domain: config.cookieDomain } : {}),
  };
}

export function setSessionCookies(res: Response, config: AppConfig, session: IssuedSession) {
  res.cookie(ACCESS_COOKIE, session.accessToken, {
    ...base(config),
    path: "/",
    maxAge: config.accessTokenTtlSeconds * 1000,
  });
  res.cookie(REFRESH_COOKIE, session.refreshToken, {
    ...base(config),
    path: refreshCookiePath(config),
    expires: session.refreshExpiresAt,
  });
  res.cookie(SESSION_HINT_COOKIE, "1", {
    ...base(config),
    httpOnly: false,
    path: "/",
    expires: session.refreshExpiresAt,
  });
}

export function clearSessionCookies(res: Response, config: AppConfig) {
  res.clearCookie(ACCESS_COOKIE, { ...base(config), path: "/" });
  res.clearCookie(REFRESH_COOKIE, { ...base(config), path: refreshCookiePath(config) });
  res.clearCookie(SESSION_HINT_COOKIE, { ...base(config), httpOnly: false, path: "/" });
}

export function oauthStateCookieOptions(config: AppConfig): CookieOptions {
  return { ...base(config), path: `${authPath(config)}/github`, maxAge: 10 * 60 * 1000 };
}
