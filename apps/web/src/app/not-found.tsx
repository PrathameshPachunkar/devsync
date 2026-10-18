import Link from "next/link";

import { DevSyncMark } from "@/components/brand/devsync-logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <DevSyncMark className="size-10" />
      <div className="grid gap-1">
        <h1 className="text-xl font-semibold">Page not found</h1>
        <p className="text-sm text-muted-foreground">
          This board or page does not exist, or you no longer have access to it.
        </p>
      </div>
      <Button asChild>
        <Link href="/boards">Back to boards</Link>
      </Button>
    </main>
  );
}
