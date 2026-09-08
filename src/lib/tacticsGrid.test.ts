import { describe, expect, it } from "vitest";
import { ATTRIBUTE_KEYS } from "./attributes";
import {
  compareStatLine,
  numericWinner,
  parseTacticsColumns,
  tacticsCompareAttributeOrder,
  toggleTacticsColumn,
  winnerTone,
} from "./tacticsGrid";

describe("tactics grid columns", () => {
  it("keeps known attribute keys in order and drops junk", () => {
    expect(parseTacticsColumns(["shooting", "hooking", "shooting", "nope", 12, "firstTouch"])).toEqual([
      "shooting",
      "hooking",
      "firstTouch",
    ]);
    expect(parseTacticsColumns(null)).toEqual([]);
  });

  it("toggles a column on and off without disturbing the rest", () => {
    expect(toggleTacticsColumn([], "speed")).toEqual(["speed"]);
    expect(toggleTacticsColumn(["speed", "passing"], "passing")).toEqual(["speed"]);
    expect(toggleTacticsColumn(["speed"], "hooking")).toEqual(["speed", "hooking"]);
  });

  it("lists selected attributes first when comparing", () => {
    const order = tacticsCompareAttributeOrder(["hooking", "shooting"]);
    expect(order.slice(0, 2)).toEqual(["hooking", "shooting"]);
    expect(order).toHaveLength(ATTRIBUTE_KEYS.length);
    expect(new Set(order).size).toBe(ATTRIBUTE_KEYS.length);
  });
});

describe("tactics player compare", () => {
  it("marks the higher rating as the winner", () => {
    expect(numericWinner(14, 11)).toBe("left");
    expect(numericWinner(9, 12)).toBe("right");
    expect(numericWinner(10, 10)).toBe("tie");
    expect(compareStatLine("shooting", "Shooting", 15, 11)).toEqual({
      id: "shooting",
      label: "Shooting",
      left: 15,
      right: 11,
      winner: "left",
    });
    expect(winnerTone("left", "left")).toBe("is-up");
    expect(winnerTone("left", "right")).toBe("is-down");
    expect(winnerTone("tie", "left")).toBe("");
  });
});
