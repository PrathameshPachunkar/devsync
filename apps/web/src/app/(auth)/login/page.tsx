import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { LoginForm } from "@/features/auth/components/auth-forms";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  // The form reads search params (?next, ?error), which suspends under Cache Components.
  return (
    <Suspense fallback={<Skeleton className="h-[30rem] w-full max-w-sm rounded-xl" />}>
      <LoginForm />
    </Suspense>
  );
}
