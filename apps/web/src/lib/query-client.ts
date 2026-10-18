import { QueryClient } from "@tanstack/react-query";

/**
 * Server state lives in TanStack Query. Board data is kept fresh by realtime
 * events (Phase 4), so window-focus refetching is off and data stays fresh
 * for 30s by default.
 */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
