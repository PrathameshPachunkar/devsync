import { describe, expect, it } from "vitest";

import { ACCENT_INIT_SCRIPT } from "./accent-script";
import { ACCENT_STORAGE_KEY, accentCssVars, DEFAULT_ACCENT, parseAccentSetting } from "./accents";

function runScript() {
  // Execute the exact string that ships in <head>.
  new Function(ACCENT_INIT_SCRIPT)();
  const style = document.documentElement.style;
  return {
    "--brand-h": style.getPropertyValue("--brand-h"),
    "--brand-c": style.getPropertyValue("--brand-c"),
  };
}

function store(accent: unknown) {
  window.localStorage.setItem(
    ACCENT_STORAGE_KEY,
    JSON.stringify({ state: { accent }, version: 1 }),
  );
}

describe("ACCENT_INIT_SCRIPT", () => {
  it("applies the default accent when nothing is stored", () => {
    expect(runScript()).toEqual(accentCssVars(DEFAULT_ACCENT));
  });

  it("survives corrupt storage", () => {
    window.localStorage.setItem(ACCENT_STORAGE_KEY, "{not json");
    expect(runScript()).toEqual(accentCssVars(DEFAULT_ACCENT));
  });

  // The script duplicates the parsing logic, so it must agree with the
  // canonical TypeScript implementation for every kind of input.
  it.each([
    { kind: "preset", id: "violet" },
    { kind: "preset", id: "rose" },
    { kind: "preset", id: "hasOwnProperty" },
    { kind: "custom", hue: 123 },
    { kind: "custom", hue: -45 },
    { kind: "custom", hue: 721.26 },
    { kind: "custom", hue: "90" },
    { kind: "nope" },
  ])("matches parseAccentSetting for %j", (accent) => {
    store(accent);
    const expected = accentCssVars(parseAccentSetting(accent) ?? DEFAULT_ACCENT);
    expect(runScript()).toEqual(expected);
  });
});
