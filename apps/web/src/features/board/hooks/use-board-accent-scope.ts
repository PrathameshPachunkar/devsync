"use client";

import { accentScopeProps, type AccentScopeProps } from "@/lib/theme/accents";

import { useBoardStore } from "../store/board-store";

/**
 * Radix dialogs and sheets portal to <body>, outside the board's accent
 * scope. Spread this on their content so they keep the board's color.
 */
export function useBoardAccentScope(): AccentScopeProps | Record<string, never> {
  const accent = useBoardStore((state) => state.accent);
  return accent ? accentScopeProps(accent) : {};
}
