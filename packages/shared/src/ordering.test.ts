import { describe, expect, it } from "vitest";

import {
  comparePositions,
  needsRebalance,
  neighborsOf,
  positionBetween,
  positionForNeighbors,
  positionsBetween,
  sortByPosition,
} from "./ordering";

describe("comparePositions", () => {
  it("uses byte order, not locale order", () => {
    // Locale collation would put "a" before "B". Byte order puts uppercase first.
    expect(comparePositions("B", "a")).toBe(-1);
    expect(["a", "B"].sort((x, y) => x.localeCompare(y))).toEqual(["a", "B"]);
    expect(["a", "B"].sort(comparePositions)).toEqual(["B", "a"]);
  });
});

describe("positionBetween", () => {
  it("creates keys that sort between their neighbors", () => {
    const first = positionBetween(null, null);
    const last = positionBetween(first, null);
    const middle = positionBetween(first, last);
    expect(sortByPosition([{ position: last }, { position: middle }, { position: first }])).toEqual(
      [{ position: first }, { position: middle }, { position: last }],
    );
  });

  it("rejects neighbors in the wrong order", () => {
    expect(() => positionBetween("a1", "a0")).toThrow(RangeError);
    expect(() => positionBetween("a1", "a1")).toThrow(RangeError);
  });

  it("keeps keys short under 200 repeated inserts at the same spot", () => {
    let low = positionBetween(null, null);
    const high = positionBetween(low, null);
    for (let i = 0; i < 200; i += 1) {
      const next = positionBetween(low, high);
      expect(comparePositions(low, next)).toBe(-1);
      expect(comparePositions(next, high)).toBe(-1);
      low = next;
    }
    // Float midpoints would have run out of precision after about 50 inserts.
    expect(needsRebalance(low)).toBe(false);
  });
});

describe("positionsBetween", () => {
  it("returns sorted distinct keys", () => {
    const keys = positionsBetween(null, null, 10);
    expect(new Set(keys).size).toBe(10);
    expect([...keys].sort(comparePositions)).toEqual(keys);
  });
});

describe("neighborsOf / positionForNeighbors", () => {
  it("finds neighbors at the edges and in the middle", () => {
    expect(neighborsOf(["a", "b", "c"], "a")).toEqual({ prevId: null, nextId: "b" });
    expect(neighborsOf(["a", "b", "c"], "b")).toEqual({ prevId: "a", nextId: "c" });
    expect(neighborsOf(["a", "b", "c"], "c")).toEqual({ prevId: "b", nextId: null });
    expect(() => neighborsOf(["a"], "z")).toThrow(RangeError);
  });

  it("computes a key from neighbor ids", () => {
    const positions = new Map([
      ["x", "a0"],
      ["y", "a1"],
    ]);
    const key = positionForNeighbors({ prevId: "x", nextId: "y" }, (id) => positions.get(id));
    expect(comparePositions("a0", key)).toBe(-1);
    expect(comparePositions(key, "a1")).toBe(-1);
  });
});
