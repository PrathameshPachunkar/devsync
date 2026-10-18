import { describe, expect, it } from "vitest";

import { getBreadcrumbs, isNavItemActive } from "./navigation";

describe("isNavItemActive", () => {
  it("matches exact routes only when match is exact", () => {
    expect(isNavItemActive("/boards", "/boards", "exact")).toBe(true);
    expect(isNavItemActive("/boards/devsync-core", "/boards", "exact")).toBe(false);
  });

  it("matches nested routes when match is prefix", () => {
    expect(isNavItemActive("/settings/appearance/x", "/settings/appearance", "prefix")).toBe(true);
  });

  it("does not treat a shared string prefix as nesting", () => {
    expect(isNavItemActive("/boards-archive", "/boards", "prefix")).toBe(false);
  });

  it("is never active while the pathname is suspended", () => {
    expect(isNavItemActive(null, "/boards", "exact")).toBe(false);
  });
});

describe("getBreadcrumbs", () => {
  it("builds board crumbs from mock data", () => {
    expect(getBreadcrumbs("/boards/devsync-core")).toEqual([
      { label: "Boards", href: "/boards" },
      { label: "DevSync Core" },
    ]);
  });

  it("falls back to a generic label for unknown boards", () => {
    expect(getBreadcrumbs("/boards/missing")).toEqual([
      { label: "Boards", href: "/boards" },
      { label: "Board" },
    ]);
  });

  it("labels settings pages", () => {
    expect(getBreadcrumbs("/settings/appearance")).toEqual([
      { label: "Settings" },
      { label: "Appearance" },
    ]);
  });

  it("returns nothing for unknown sections", () => {
    expect(getBreadcrumbs("/")).toEqual([]);
  });
});
