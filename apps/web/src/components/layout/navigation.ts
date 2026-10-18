import { Palette, SquareKanban, type LucideIcon } from "lucide-react";

import { getMockBoard } from "@/features/boards/data/mock-boards";

export type NavMatch = "exact" | "prefix";

export interface NavItem {
  readonly title: string;
  readonly href: string;
  readonly icon: LucideIcon;
  readonly match: NavMatch;
}

export const PRIMARY_NAV: readonly NavItem[] = [
  { title: "Boards", href: "/boards", icon: SquareKanban, match: "exact" },
  { title: "Appearance", href: "/settings/appearance", icon: Palette, match: "prefix" },
];

/** `pathname` is null while the real pathname is still suspended. Nothing is active then. */
export function isNavItemActive(pathname: string | null, href: string, match: NavMatch): boolean {
  if (pathname === null) return false;
  if (pathname === href) return true;
  return match === "prefix" && pathname.startsWith(`${href}/`);
}

export interface Crumb {
  readonly label: string;
  readonly href?: string;
}

export function getBreadcrumbs(pathname: string): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  const [section, id] = segments;

  if (section === "boards") {
    if (!id) return [{ label: "Boards" }];
    return [
      { label: "Boards", href: "/boards" },
      { label: getMockBoard(decodeURIComponent(id))?.name ?? "Board" },
    ];
  }

  if (section === "settings") {
    const page = id === "appearance" ? "Appearance" : undefined;
    return page ? [{ label: "Settings" }, { label: page }] : [{ label: "Settings" }];
  }

  return [];
}
