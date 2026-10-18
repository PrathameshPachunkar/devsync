import { OrderingConflictError, type ApiErrorBody } from "@devsync/shared";
import type { NextFunction, Request, Response } from "express";

import { HttpError } from "../lib/http-error";
import type { Logger } from "../lib/logger";

function pgCode(error: unknown): string | undefined {
  // Drizzle may wrap driver errors. The SQLSTATE lives on the error or its cause.
  const candidate = error as { code?: unknown; cause?: { code?: unknown } };
  const code = candidate?.code ?? candidate?.cause?.code;
  return typeof code === "string" ? code : undefined;
}

function toHttpError(error: unknown): HttpError | null {
  if (error instanceof HttpError) return error;
  if (error instanceof OrderingConflictError) {
    return new HttpError(409, "stale_position", error.message);
  }
  const bodyError = error as { type?: string; status?: number };
  if (bodyError?.type === "entity.parse.failed") {
    return new HttpError(400, "invalid_json", "Request body is not valid JSON");
  }
  if (bodyError?.type === "entity.too.large") {
    return new HttpError(413, "payload_too_large", "Request body is too large");
  }
  switch (pgCode(error)) {
    case "23505": // unique_violation
      return new HttpError(409, "conflict", "That conflicts with existing data. Refresh and retry");
    case "23503": // foreign_key_violation
      return new HttpError(409, "conflict", "A related record no longer exists");
    default:
      return null;
  }
}

export function notFoundHandler(req: Request) {
  throw new HttpError(404, "route_not_found", `No route for ${req.method} ${req.path}`);
}

/** Every error leaves as `{ error: { code, message, details? } }`. Internals are never leaked. */
export function errorHandler(logger: Logger) {
  // Express identifies error middleware by its four parameters.
  return (error: unknown, req: Request, res: Response, _next: NextFunction) => {
    const known = toHttpError(error);
    const status = known?.status ?? 500;
    if (status >= 500)
      logger.error({ err: error, method: req.method, url: req.originalUrl }, "Unhandled error");

    const body: ApiErrorBody = {
      error: known
        ? {
            code: known.code,
            message: known.message,
            ...(known.details === undefined ? {} : { details: known.details }),
          }
        : { code: "internal_error", message: "Something went wrong on our side" },
    };
    res.status(status).json(body);
  };
}
