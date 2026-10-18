import { rateLimit } from "express-rate-limit";

import { HttpError } from "../lib/http-error";

/** Throttles credential and account-creation endpoints per client IP. */
export function authRateLimit(limit: number) {
  return rateLimit({
    windowMs: 15 * 60 * 1000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) => {
      next(new HttpError(429, "rate_limited", "Too many attempts. Try again in a few minutes"));
    },
  });
}
