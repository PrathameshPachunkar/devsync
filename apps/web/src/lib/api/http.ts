import type { ApiErrorBody } from "@devsync/shared";

/** Baked in at build time. Defaults to the local API. */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(
  /\/$/,
  "",
);

/** Readable cookie the API sets alongside the httpOnly session cookies. */
export const SESSION_HINT_COOKIE = "devsync_session";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const isApiError = (error: unknown, status?: number): error is ApiError =>
  error instanceof ApiError && (status === undefined || error.status === status);

async function toApiError(response: Response): Promise<ApiError> {
  const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
  return new ApiError(
    response.status,
    body?.error.code ?? "http_error",
    body?.error.message ?? `Request failed (${response.status})`,
    body?.error.details,
  );
}

let refreshInFlight: Promise<boolean> | null = null;

/**
 * Single-flight refresh. Twenty requests failing at once with an expired
 * access token trigger one refresh, and all retry after it. If another tab
 * won the rotation race, the browser already holds its new cookies, so
 * retrying is still correct.
 */
function refreshSession(): Promise<boolean> {
  refreshInFlight ??= fetch(`${API_URL}/v1/auth/refresh`, {
    method: "POST",
    credentials: "include",
  })
    .then(async (response) => {
      if (response.ok) return true;
      const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
      return body?.error.code === "token_rotated";
    })
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

export interface ApiRequest {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  /** Auth endpoints that must not trigger a refresh-and-retry. */
  skipRefresh?: boolean;
}

/**
 * JSON fetch against the DevSync API with cookie credentials. Error bodies
 * become an ApiError, and an expired session is refreshed transparently once.
 */
export async function apiFetch<T>(path: string, request: ApiRequest = {}): Promise<T> {
  const { method = "GET", body, signal, skipRefresh = false } = request;
  const send = () =>
    fetch(`${API_URL}${path}`, {
      method,
      credentials: "include",
      signal,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  let response = await send();
  if (response.status === 401 && !skipRefresh && (await refreshSession())) {
    response = await send();
  }
  if (!response.ok) throw await toApiError(response);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** Pure, testable cookie check used by the route guard. */
export function hasSessionHint(cookieHeader: string | null | undefined): boolean {
  return (cookieHeader ?? "")
    .split(";")
    .some((c) => c.trim().startsWith(`${SESSION_HINT_COOKIE}=`));
}
