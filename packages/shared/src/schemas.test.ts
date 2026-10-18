import { describe, expect, it } from "vitest";

import { OrderingConflictError, placeAmong, positionsBetween } from "./ordering";
import { createBoardSchema, moveCardSchema, registerSchema, updateCardSchema } from "./schemas";

describe("request schemas", () => {
  it("normalizes emails and enforces password length", () => {
    const ok = registerSchema.parse({
      name: "  Ada ",
      email: " ADA@Example.COM ",
      password: "correct horse",
    });
    expect(ok).toEqual({ name: "Ada", email: "ada@example.com", password: "correct horse" });
    expect(
      registerSchema.safeParse({ name: "A", email: "a@b.co", password: "short" }).success,
    ).toBe(false);
  });

  it("fills board defaults", () => {
    expect(createBoardSchema.parse({ name: "Launch" })).toEqual({
      name: "Launch",
      description: "",
      accent: null,
    });
  });

  it("requires uuids for move targets", () => {
    expect(
      moveCardSchema.safeParse({ toColumnId: "nope", prevCardId: null, nextCardId: null }).success,
    ).toBe(false);
  });

  it("rejects empty updates", () => {
    expect(updateCardSchema.safeParse({}).success).toBe(false);
    expect(updateCardSchema.safeParse({ description: null }).success).toBe(true);
  });
});

describe("placeAmong", () => {
  const [a, b, c] = positionsBetween(null, null, 3) as [string, string, string];
  const siblings = [
    { id: "a", position: a },
    { id: "b", position: b },
    { id: "c", position: c },
  ];

  it("anchors after prev, before next, or at the end", () => {
    const afterA = placeAmong(siblings, "a", "b");
    expect(afterA > a && afterA < b).toBe(true);
    const beforeA = placeAmong(siblings, null, "a");
    expect(beforeA < a).toBe(true);
    expect(placeAmong(siblings, null, null) > c).toBe(true);
  });

  it("trusts the prev anchor over a stale next", () => {
    const key = placeAmong(siblings, "a", "c");
    expect(key > a && key < b).toBe(true);
  });

  it("signals a conflict when the anchor is gone", () => {
    expect(() => placeAmong(siblings, "ghost", null)).toThrow(OrderingConflictError);
  });
});
