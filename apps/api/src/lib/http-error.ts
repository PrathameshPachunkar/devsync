import type { z } from "zod";

/** An error that maps directly to an HTTP response. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export const badRequest = (code: string, message: string, details?: unknown) =>
  new HttpError(400, code, message, details);
export const unauthorized = (code = "unauthenticated", message = "Sign in to continue") =>
  new HttpError(401, code, message);
export const forbidden = (message = "You don't have permission to do that", details?: unknown) =>
  new HttpError(403, "forbidden", message, details);
export const notFound = (code: string, message: string) => new HttpError(404, code, message);
export const conflict = (code: string, message: string) => new HttpError(409, code, message);

/** Validates untrusted input. Failures become a 400 listing every issue. */
export function parse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw badRequest(
    "validation_failed",
    "Some fields are invalid",
    result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  );
}
