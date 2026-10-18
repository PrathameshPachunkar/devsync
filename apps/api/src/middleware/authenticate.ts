import type { NextFunction, Request, Response } from "express";

import { unauthorized } from "../lib/http-error";
import { ACCESS_COOKIE } from "../modules/auth/cookies";
import type { AccessTokenService } from "../modules/auth/tokens";

/**
 * Accepts the access token from the httpOnly cookie (browsers) or an
 * `Authorization: Bearer` header (scripts and other API clients).
 */
export function readAccessToken(req: Request): string | undefined {
  const header = req.get("authorization");
  if (header?.startsWith("Bearer ")) return header.slice(7).trim() || undefined;
  const cookie: unknown = req.cookies?.[ACCESS_COOKIE];
  return typeof cookie === "string" && cookie ? cookie : undefined;
}

export function authenticate(tokens: AccessTokenService) {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const token = readAccessToken(req);
    if (!token) throw unauthorized();
    req.auth = { userId: await tokens.verify(token) };
    next();
  };
}

export function requireAuth(req: Request): { userId: string } {
  if (!req.auth) throw unauthorized();
  return req.auth;
}
