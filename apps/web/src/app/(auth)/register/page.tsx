import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { RegisterForm } from "@/features/auth/components/auth-forms";

export const metadata: Metadata = { title: "Create account" };

export default function RegisterPage() {
  return (
    <Suspense fallback={<Skeleton className="h-[34rem] w-full max-w-sm rounded-xl" />}>
      <RegisterForm />
    </Suspense>
  );
}
