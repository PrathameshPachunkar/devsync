import Link from "next/link";
import type { ReactNode } from "react";

import { DevSyncMark } from "@/components/brand/devsync-logo";
import { AppearanceMenu } from "@/components/theme/appearance-menu";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-board">
      <header className="flex items-center justify-between p-4">
        <Link href="/login" className="flex items-center gap-2 font-semibold">
          <DevSyncMark />
          DevSync
        </Link>
        <AppearanceMenu />
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center">
        {children}
      </main>
    </div>
  );
}
