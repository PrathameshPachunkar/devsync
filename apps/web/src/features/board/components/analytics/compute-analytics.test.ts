import { describe, expect, it } from "vitest";

import { normalizeBoard } from "../../model/normalize";
import { seed } from "../../test-utils";
import { computeBoardAnalytics } from "./compute-analytics";

describe("computeBoardAnalytics", () => {
  const board = seed();
  const analytics = computeBoardAnalytics(normalizeBoard(board));

  it("counts every card exactly once", () => {
    expect(analytics.totalCards).toBe(120);
    expect(analytics.columns.reduce((sum, c) => sum + c.count, 0)).toBe(120);
    const linked = board.cards.filter((c) => c.github).length;
    expect(Object.values(analytics.github).reduce((a, b) => a + b, 0)).toBe(linked);
  });

  it("flags columns over their WIP limit", () => {
    for (const column of analytics.columns) {
      expect(column.overLimit).toBe(column.wipLimit !== null && column.count > column.wipLimit);
    }
    expect(analytics.overLimitColumns).toBe(analytics.columns.filter((c) => c.overLimit).length);
  });

  it("returns at most six labels, most used first", () => {
    expect(analytics.labels.length).toBeLessThanOrEqual(6);
    const counts = analytics.labels.map((l) => l.count);
    expect([...counts].sort((a, b) => b - a)).toEqual(counts);
  });
});
