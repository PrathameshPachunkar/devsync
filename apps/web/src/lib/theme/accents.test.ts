import { describe, expect, it } from "vitest";

import {
  ACCENT_PRESETS,
  accentCssVars,
  accentScopeProps,
  applyAccent,
  CUSTOM_ACCENT_CHROMA,
  normalizeHue,
  parseAccentSetting,
  resolveAccent,
} from "./accents";

describe("normalizeHue", () => {
  it.each([
    [0, 0],
    [359, 359],
    [360, 0],
    [725, 5],
    [-30, 330],
    [12.345, 12.3],
  ])("wraps %d to %d", (input, expected) => {
    expect(normalizeHue(input)).toBe(expected);
  });

  it("falls back to the default hue for non-finite input", () => {
    expect(normalizeHue(Number.NaN)).toBe(ACCENT_PRESETS.indigo.hue);
    expect(normalizeHue(Number.POSITIVE_INFINITY)).toBe(ACCENT_PRESETS.indigo.hue);
  });
});

describe("parseAccentSetting", () => {
  it("accepts known presets", () => {
    expect(parseAccentSetting({ kind: "preset", id: "teal" })).toEqual({
      kind: "preset",
      id: "teal",
    });
  });

  it("normalizes custom hues", () => {
    expect(parseAccentSetting({ kind: "custom", hue: 400 })).toEqual({ kind: "custom", hue: 40 });
  });

  it.each([
    null,
    undefined,
    "indigo",
    { kind: "preset", id: "toString" },
    { kind: "preset", id: "unknown" },
    { kind: "custom", hue: "120" },
    { kind: "custom", hue: Number.NaN },
    { kind: "gradient" },
  ])("rejects %j", (value) => {
    expect(parseAccentSetting(value)).toBeNull();
  });
});

describe("resolveAccent / accentCssVars", () => {
  it("resolves presets to their tokens", () => {
    expect(resolveAccent({ kind: "preset", id: "rose" })).toEqual({ hue: 12, chroma: 0.2 });
  });

  it("uses the shared chroma for custom hues", () => {
    expect(accentCssVars({ kind: "custom", hue: 100 })).toEqual({
      "--brand-h": "100",
      "--brand-c": String(CUSTOM_ACCENT_CHROMA),
    });
  });

  it("marks scoped subtrees so globals.css recomputes derived tokens", () => {
    expect(accentScopeProps({ kind: "preset", id: "teal" })).toEqual({
      "data-accent-scope": "",
      style: { "--brand-h": "182", "--brand-c": "0.11" },
    });
  });

  it("writes the variables onto an element", () => {
    const element = document.createElement("div");
    applyAccent(element, { kind: "preset", id: "green" });
    expect(element.style.getPropertyValue("--brand-h")).toBe("150");
    expect(element.style.getPropertyValue("--brand-c")).toBe("0.15");
  });
});
