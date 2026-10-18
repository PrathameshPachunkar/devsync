"use client";

import type { SessionUserDto } from "@devsync/shared";
import { ChevronsUpDown, LogOut, Palette } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { GitHubIcon } from "@/components/icons/github-icon";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useLogout, useSession } from "@/features/auth/hooks";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function UserIdentity({ user }: { user: SessionUserDto }) {
  const subtitle = user.isGuest
    ? "Demo sandbox"
    : (user.email ?? (user.githubLogin ? `@${user.githubLogin}` : ""));
  return (
    <>
      <Avatar className="size-8 rounded-lg">
        {user.avatarUrl && <AvatarImage src={user.avatarUrl} alt="" />}
        <AvatarFallback className="rounded-lg">{initials(user.name)}</AvatarFallback>
      </Avatar>
      <span className="grid flex-1 text-left text-sm leading-tight">
        <span className="truncate font-medium">{user.name}</span>
        <span className="truncate text-xs text-muted-foreground">{subtitle}</span>
      </span>
    </>
  );
}

export function UserMenu() {
  const { isMobile } = useSidebar();
  const { data: user } = useSession();
  const logout = useLogout();
  const router = useRouter();

  // The auth gate only renders the shell once a session exists.
  if (!user) return null;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              aria-label="Account menu"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <UserIdentity user={user} />
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="flex items-center gap-2 font-normal">
              <UserIdentity user={user} />
            </DropdownMenuLabel>
            {user.githubLogin && (
              <DropdownMenuLabel className="flex items-center gap-1.5 pt-0 text-xs font-normal text-muted-foreground">
                <GitHubIcon className="size-3" />
                Linked to @{user.githubLogin}
              </DropdownMenuLabel>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings/appearance">
                <Palette />
                Appearance
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                logout.mutate(undefined, { onSettled: () => router.replace("/login") })
              }
            >
              <LogOut />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
