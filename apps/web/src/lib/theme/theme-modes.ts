export const THEME_STORAGE_KEY = "devsync-theme";

export const THEME_MODES = ["light", "dark", "system"] as const;

export type ThemeMode = (typeof THEME_MODES)[number];

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && (THEME_MODES as readonly string[]).includes(value);
}

export const THEME_MODE_LABELS: Readonly<Record<ThemeMode, string>> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

export const THEME_MODE_DESCRIPTIONS: Readonly<Record<ThemeMode, string>> = {
  light: "Crisp, high-contrast workspace.",
  dark: "Low eye strain for long sessions.",
  system: "Follows your operating system.",
};
