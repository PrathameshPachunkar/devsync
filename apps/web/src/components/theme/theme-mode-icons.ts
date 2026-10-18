import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";

import type { ThemeMode } from "@/lib/theme/theme-modes";

export const THEME_MODE_ICONS: Readonly<Record<ThemeMode, LucideIcon>> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};
