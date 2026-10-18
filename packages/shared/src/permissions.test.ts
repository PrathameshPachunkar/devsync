import { describe, expect, it } from "vitest";

import { BOARD_PERMISSIONS, can, isBoardRole, type BoardPermission } from "./permissions";

describe("can", () => {
  it.each<[BoardPermission, boolean, boolean, boolean]>([
    ["board:view", true, true, true],
    ["card:move", true, true, false],
    ["column:reorder", true, true, false],
    ["column:delete", true, false, false],
    ["repo:link", true, false, false],
    ["member:manage", true, false, false],
  ])("%s → admin %s, maintainer %s, viewer %s", (permission, admin, maintainer, viewer) => {
    expect(can("ADMIN", permission)).toBe(admin);
    expect(can("MAINTAINER", permission)).toBe(maintainer);
    expect(can("VIEWER", permission)).toBe(viewer);
  });

  it("grants admins every permission", () => {
    for (const permission of Object.keys(BOARD_PERMISSIONS) as BoardPermission[]) {
      expect(can("ADMIN", permission)).toBe(true);
    }
  });

  it("validates roles", () => {
    expect(isBoardRole("MAINTAINER")).toBe(true);
    expect(isBoardRole("OWNER")).toBe(false);
  });
});
