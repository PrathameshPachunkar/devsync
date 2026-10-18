import { Suspense } from "react";

import { AppearanceMenu } from "@/components/theme/appearance-menu";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

import { AppBreadcrumbs } from "./app-breadcrumbs";

export function AppTopbar() {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur-sm sm:px-4">
      <SidebarTrigger className="-ml-1" />
      <Separator
        orientation="vertical"
        className="mx-1 data-vertical:h-4 data-vertical:self-center"
      />
      <Suspense fallback={null}>
        <AppBreadcrumbs />
      </Suspense>
      <div className="ml-auto flex items-center gap-1">
        <AppearanceMenu />
      </div>
    </header>
  );
}
