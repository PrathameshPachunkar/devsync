import type { AuthProvidersDto, LoginInput, RegisterInput, SessionUserDto } from "@devsync/shared";

import { API_URL, apiFetch, isApiError } from "@/lib/api/http";

interface SessionResponse {
  user: SessionUserDto;
}

export const sessionKey = ["session"] as const;
export const providersKey = ["auth-providers"] as const;

export const authApi = {
  /** The signed-in user, or null when there is no valid session. */
  async me(): Promise<SessionUserDto | null> {
    try {
      return (await apiFetch<SessionResponse>("/v1/auth/me")).user;
    } catch (error) {
      if (isApiError(error, 401)) return null;
      throw error;
    }
  },
  providers: () => apiFetch<AuthProvidersDto>("/v1/auth/providers", { skipRefresh: true }),
  login: async (input: LoginInput) =>
    (
      await apiFetch<SessionResponse>("/v1/auth/login", {
        method: "POST",
        body: input,
        skipRefresh: true,
      })
    ).user,
  register: async (input: RegisterInput) =>
    (
      await apiFetch<SessionResponse>("/v1/auth/register", {
        method: "POST",
        body: input,
        skipRefresh: true,
      })
    ).user,
  demo: async () =>
    (await apiFetch<SessionResponse>("/v1/auth/demo", { method: "POST", skipRefresh: true })).user,
  logout: () => apiFetch<void>("/v1/auth/logout", { method: "POST", skipRefresh: true }),
  /** Full-page navigation: GitHub's consent screen can't load in a fetch. */
  githubUrl: (next: string) => `${API_URL}/v1/auth/github?next=${encodeURIComponent(next)}`,
};

/** Only same-site relative paths, never `//evil.example`. */
export function safeNext(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/boards";
  return value;
}
