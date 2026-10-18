import type { NextFunction, Request, Response } from "express";

import { HttpError } from "../lib/http-error";
import { ACCESS_COOKIE, REFRESH_COOKIE } from "../modules/auth/cookies";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function requestOrigin(req: Request): string | undefined {
  const origin = req.get("origin");
  if (origin && origin !== "null") return origin;
  const referer = req.get("referer");
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

/**
 * CSRF defense for cookie-authenticated writes. SameSite=Lax already blocks
 * most cross-site POSTs, and this check also blocks sibling subdomains,
 * which count as same-site. Bearer-token clients don't need it, because a
 * browser never attaches that header on its own.
 */
export function originCheck(allowedOrigins: readonly string[]) {
  const allowed = new Set(allowedOrigins);
  return (req: Request, _res: Response, next: NextFunction) => {
    if (SAFE_METHODS.has(req.method)) return next();
    if (req.get("authorization")?.startsWith("Bearer ")) return next();

    const usesCookies = Boolean(req.cookies?.[ACCESS_COOKIE] || req.cookies?.[REFRESH_COOKIE]);
    const origin = requestOrigin(req);
    // Browsers always send Origin on cross-origin POSTs. A request with
    // cookies and no Origin is not a browser form attack, but is rejected
    // anyway when it carries a session, to be safe.
    if (origin ? !allowed.has(origin) : usesCookies) {
      throw new HttpError(403, "origin_not_allowed", "Request origin is not allowed");
    }
    next();
  };
}
