import {
  ACCENT_PRESETS,
  ACCENT_STORAGE_KEY,
  CUSTOM_ACCENT_CHROMA,
  DEFAULT_ACCENT_PRESET,
  type AccentTokens,
} from "./accents";

/**
 * Runs as a blocking inline <script> in <head>, before first paint, so a
 * persisted accent never flashes the default color.
 *
 * It is serialized with Function.prototype.toString, so it must stay
 * self-contained: no imports, closures, or helpers. Its decoding mirrors
 * `parseAccentSetting` + `resolveAccent`; accent-script.test.ts keeps the
 * two implementations in agreement.
 */
export function initAccent(
  storageKey: string,
  presets: Record<string, AccentTokens>,
  fallbackId: string,
  customChroma: number,
): void {
  let tokens = presets[fallbackId];
  try {
    const raw = window.localStorage.getItem(storageKey);
    const accent = raw ? JSON.parse(raw)?.state?.accent : null;
    if (
      accent &&
      accent.kind === "preset" &&
      typeof accent.id === "string" &&
      Object.prototype.hasOwnProperty.call(presets, accent.id)
    ) {
      tokens = presets[accent.id];
    } else if (
      accent &&
      accent.kind === "custom" &&
      typeof accent.hue === "number" &&
      Number.isFinite(accent.hue)
    ) {
      const wrapped = ((accent.hue % 360) + 360) % 360;
      tokens = { hue: Math.round(wrapped * 10) / 10, chroma: customChroma };
    }
  } catch {
    // Storage blocked (private mode) or corrupt JSON: keep the fallback.
  }
  if (tokens) {
    const style = document.documentElement.style;
    style.setProperty("--brand-h", String(tokens.hue));
    style.setProperty("--brand-c", String(tokens.chroma));
  }
}

const presetTokens: Record<string, AccentTokens> = Object.fromEntries(
  Object.entries(ACCENT_PRESETS).map(([id, { hue, chroma }]) => [id, { hue, chroma }]),
);

export const ACCENT_INIT_SCRIPT = `(${initAccent.toString()})(${JSON.stringify(
  ACCENT_STORAGE_KEY,
)},${JSON.stringify(presetTokens)},${JSON.stringify(DEFAULT_ACCENT_PRESET)},${CUSTOM_ACCENT_CHROMA})`;
