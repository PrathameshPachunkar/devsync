"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { memo, Suspense, type ComponentProps } from "react";

import { DevSyncMark } from "@/components/brand/devsync-logo";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { MOCK_BOARDS } from "@/features/boards/data/mock-boards";
import { accentScopeProps } from "@/lib/theme/accents";

import { isNavItemActive, PRIMARY_NAV } from "./navigation";
import { UserMenu } from "./user-menu";

export function AppSidebar(props: ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="DevSync">
              <Link href="/boards">
                <DevSyncMark />
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate font-semibold">DevSync</span>
                  <span className="truncate text-xs text-muted-foreground">Demo workspace</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/*
          usePathname suspends on dynamic board routes under Cache Components.
          The fallback renders identical navigation with no active item, so the
          prerendered shell stays complete.
        */}
        <Suspense fallback={<SidebarNavigation pathname={null} />}>
          <ActiveSidebarNavigation />
        </Suspense>
      </SidebarContent>

      <SidebarFooter>
        <UserMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function ActiveSidebarNavigation() {
  return <SidebarNavigation pathname={usePathname()} />;
}

const SidebarNavigation = memo(function SidebarNavigation({
  pathname,
}: {
  pathname: string | null;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  // On mobile the sidebar is a sheet. Close it after navigating.
  const closeOnMobile = isMobile ? () => setOpenMobile(false) : undefined;

  return (
    <>
      <SidebarGroup>
        <SidebarGroupLabel>Workspace</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {PRIMARY_NAV.map((item) => {
              const active = isNavItemActive(pathname, item.href, item.match);
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                    <Link
                      href={item.href}
                      onClick={closeOnMobile}
                      aria-current={active ? "page" : undefined}
                    >
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup>
        <SidebarGroupLabel>Boards</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            {MOCK_BOARDS.map((board) => {
              const href = `/boards/${board.id}`;
              const active = isNavItemActive(pathname, href, "prefix");
              return (
                <SidebarMenuItem key={board.id}>
                  <SidebarMenuButton asChild isActive={active} tooltip={board.name}>
                    <Link
                      href={href}
                      onClick={closeOnMobile}
                      aria-current={active ? "page" : undefined}
                    >
                      <span
                        aria-hidden="true"
                        className="flex size-4 shrink-0 items-center justify-center"
                        {...accentScopeProps(board.accent)}
                      >
                        <span className="size-2.5 rounded-full bg-primary" />
                      </span>
                      <span className="truncate">{board.name}</span>
                    </Link>
                  </SidebarMenuButton>
                  <SidebarMenuBadge aria-label={`${board.openTaskCount} open tasks`}>
                    {board.openTaskCount}
                  </SidebarMenuBadge>
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
});
