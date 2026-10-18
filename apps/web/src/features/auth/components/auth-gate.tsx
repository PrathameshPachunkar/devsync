"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { DevSyncMark } from "@/components/brand/devsync-logo";

import { useSession } from "../hooks";

/**
 * Client-side session gate for the app shell. The route proxy already
 * redirects visitors with no session cookie at all. This catches the rest:
 * expired or revoked sessions, and sign-outs in another tab.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { data: user, isPending, isError } = useSession();
  const router = useRouter();
  const signedOut = !isPending && !isError && user === null;

  useEffect(() => {
    if (!signedOut) return;
    const next = `${window.location.pathname}${window.location.search}`;
    router.replace(`/login?next=${encodeURIComponent(next)}`);
  }, [router, signedOut]);

  if (user) return children;

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-svh flex-col items-center justify-center gap-3 text-sm text-muted-foreground"
    >
      <DevSyncMark className="size-10" />
      {isError ? (
        <span>Can&apos;t reach the DevSync API. Retrying…</span>
      ) : (
        <span className="flex items-center gap-2">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          {signedOut ? "Redirecting to sign in…" : "Loading your workspace…"}
        </span>
      )}
    </div>
  );
}
