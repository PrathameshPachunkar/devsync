import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import { isApiError } from "./api/http";

/**
 * Server state lives in TanStack Query.
 *
 * - A 401 that survived the refresh attempt means the session is gone, so
 *   the session query is cleared and the auth gate sends the user to login.
 * - 4xx responses are never retried: retrying a 403 or 404 can't help.
 * - Refetch on window focus keeps a board current with collaborators'
 *   changes until realtime updates are added.
 */
export function makeQueryClient(): QueryClient {
  const onError = (error: unknown) => {
    if (isApiError(error, 401)) client.setQueryData(["session"], null);
  };
  const client: QueryClient = new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) =>
          !(isApiError(error) && error.status < 500) && failureCount < 2,
      },
      mutations: { retry: 0 },
    },
  });
  return client;
}
