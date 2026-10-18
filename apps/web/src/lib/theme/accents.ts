import type { CSSProperties } from "react";

/**
 * Accent engine: a brand color is just an OKLCH hue + chroma pair.
 * globals.css derives every tinted token (primary, ring, sidebar, board
 * surfaces...) from `--brand-h` / `--brand-c`, so swapping two variables
 * re-themes the whole UI in both light and dark mode.
 */

export const ACCENT_STORAGE_KEY = "devsync-accent";

/** Chroma used for user-picked custom hues. Moderate so every hue stays in sRGB. */
export const CUSTOM_ACCENT_CHROMA = 0.17;

export interface AccentTokens {
  /** OKLCH hue in degrees, [0, 360). */
  readonly hue: number;
  /** OKLCH chroma. */
  readonly chroma: number;
}

interface AccentPreset extends AccentTokens {
  readonly label: string;
}

export const ACCENT_PRESETS = {
  indigo: { label: "Indigo", hue: 264, chroma: 0.19 },
  violet: { label: "Violet", hue: 293, chroma: 0.2 },
  blue: { label: "Blue", hue: 245, chroma: 0.18 },
  cyan: { label: "Cyan", hue: 215, chroma: 0.13 },
  teal: { label: "Teal", hue: 182, chroma: 0.11 },
  green: { label: "Green", hue: 150, chroma: 0.15 },
  orange: { label: "Orange", hue: 45, chroma: 0.18 },
  rose: { label: "Rose", hue: 12, chroma: 0.2 },
} as const satisfies Record<string, AccentPreset>;

export type AccentPresetId = keyof typeof ACCENT_PRESETS;

export const ACCENT_PRESET_IDS = Object.keys(ACCENT_PRESETS) as AccentPresetId[];

export const DEFAULT_ACCENT_PRESET: AccentPresetId = "indigo";

export type AccentSetting =
  | { readonly kind: "preset"; readonly id: AccentPresetId }
  | { readonly kind: "custom"; readonly hue: number };

export const DEFAULT_ACCENT: AccentSetting = { kind: "preset", id: DEFAULT_ACCENT_PRESET };

export function isAccentPresetId(value: unknown): value is AccentPresetId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(ACCENT_PRESETS, value);
}

/** Wraps any finite number into [0, 360) and rounds to one decimal place. */
export function normalizeHue(hue: number): number {
  if (!Number.isFinite(hue)) return ACCENT_PRESETS[DEFAULT_ACCENT_PRESET].hue;
  const wrapped = ((hue % 360) + 360) % 360;
  return Math.round(wrapped * 10) / 10;
}

/**
 * Validates untrusted input (localStorage, API payloads) into an AccentSetting.
 * Returns null when the value is not a recognizable accent.
 */
export function parseAccentSetting(value: unknown): AccentSetting | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as { kind?: unknown; id?: unknown; hue?: unknown };

  if (candidate.kind === "preset" && isAccentPresetId(candidate.id)) {
    return { kind: "preset", id: candidate.id };
  }
  if (
    candidate.kind === "custom" &&
    typeof candidate.hue === "number" &&
    Number.isFinite(candidate.hue)
  ) {
    return { kind: "custom", hue: normalizeHue(candidate.hue) };
  }
  return null;
}

export function resolveAccent(setting: AccentSetting): AccentTokens {
  if (setting.kind === "preset") {
    const { hue, chroma } = ACCENT_PRESETS[setting.id];
    return { hue, chroma };
  }
  return { hue: normalizeHue(setting.hue), chroma: CUSTOM_ACCENT_CHROMA };
}

export type AccentCssVars = Readonly<Record<"--brand-h" | "--brand-c", string>>;

export function accentCssVars(setting: AccentSetting): AccentCssVars {
  const { hue, chroma } = resolveAccent(setting);
  return { "--brand-h": String(hue), "--brand-c": String(chroma) };
}

export interface AccentScopeProps {
  readonly "data-accent-scope": "";
  readonly style: CSSProperties;
}

/**
 * Props that give a subtree its own accent, so a board can wear its color
 * while the rest of the app keeps the user's global one. Spread them on any
 * element: `<div {...accentScopeProps(board.accent)} />`.
 *
 * The data attribute matters. globals.css re-declares the derived tokens on
 * [data-accent-scope], because CSS variables are computed where declared and
 * changing --brand-h alone would not recompute an inherited --primary.
 */
export function accentScopeProps(setting: AccentSetting): AccentScopeProps {
  return { "data-accent-scope": "", style: accentCssVars(setting) as CSSProperties };
}

export function applyAccent(element: HTMLElement, setting: AccentSetting): void {
  const vars = accentCssVars(setting);
  element.style.setProperty("--brand-h", vars["--brand-h"]);
  element.style.setProperty("--brand-c", vars["--brand-c"]);
}

/** CSS color for a swatch preview, independent of the current theme. */
export function accentSwatchColor(setting: AccentSetting): string {
  const { hue, chroma } = resolveAccent(setting);
  return `oklch(0.6 ${chroma} ${hue})`;
}
