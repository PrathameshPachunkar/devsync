"use client";

import type { SessionUserDto } from "@devsync/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { authApi, providersKey, sessionKey } from "./api";

export function useSession() {
  return useQuery({
    queryKey: sessionKey,
    queryFn: authApi.me,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export function useAuthProviders() {
  return useQuery({ queryKey: providersKey, queryFn: authApi.providers, staleTime: Infinity });
}

/** Shared by login, register, and demo: seed the session, drop anything stale. */
function useSignIn<TInput>(signIn: (input: TInput) => Promise<SessionUserDto>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: signIn,
    onSuccess: (user) => {
      queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== sessionKey[0] });
      queryClient.setQueryData(sessionKey, user);
    },
  });
}

export const useLogin = () => useSignIn(authApi.login);
export const useRegister = () => useSignIn(authApi.register);
export const useDemoLogin = () => useSignIn(() => authApi.demo());

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: authApi.logout,
    onSettled: () => {
      queryClient.clear();
      queryClient.setQueryData(sessionKey, null);
    },
  });
}
