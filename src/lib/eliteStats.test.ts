import { describe, expect, it } from "vitest";
import { ATTRIBUTE_KEYS } from "./attributes";
import { ELITE_STAT_LIMIT, ELITE_STAT_MIN, eliteStatKeys } from "./eliteStats";
import { lookForPlayer } from "./playerLooks";
import { STAT_ICON_PATH } from "./statIcons";
import { ratedSquad } from "./players";

function stubRatings(values: Partial<Record<(typeof ATTRIBUTE_KEYS)[number], number>> = {}) {
  const ratings = Object.fromEntries(ATTRIBUTE_KEYS.map((key) => [key, 12])) as Record<
    (typeof ATTRIBUTE_KEYS)[number],
    number
  >;
  return { ...ratings, ...values, familiarity: { GK: 10, FB: 10, HB: 10, MF: 10, HF: 10, FF: 10 }, overall: 12 };
}

describe("elite stat badges", () => {
  it("only lists attributes of 15 or more, capped at three highest", () => {
    expect(ELITE_STAT_MIN).toBe(15);
    expect(eliteStatKeys(stubRatings({ highFielding: 14, shooting: 13 }))).toEqual([]);
    expect(eliteStatKeys(stubRatings({ highFielding: 15 }))).toEqual(["highFielding"]);
    expect(
      eliteStatKeys(
        stubRatings({
          highFielding: 19,
          shooting: 18,
          speed: 14,
          frees: 20,
          composure: 18,
        }),
      ),
    ).toEqual(["frees", "highFielding", "shooting"]);
    expect(
      eliteStatKeys(
        stubRatings({
          highFielding: 19,
          shooting: 18,
          speed: 18,
          frees: 20,
          composure: 18,
        }),
      ),
    ).toHaveLength(ELITE_STAT_LIMIT);
  });

  it("has a distinct icon for every attribute", () => {
    expect(ATTRIBUTE_KEYS.every((key) => STAT_ICON_PATH[key].length > 8)).toBe(true);
    expect(new Set(ATTRIBUTE_KEYS.map((key) => STAT_ICON_PATH[key])).size).toBe(ATTRIBUTE_KEYS.length);
  });
});

describe("player looks", () => {
  it("uses a stylized look for covered Clare seniors and a silhouette for the rest", () => {
    expect(lookForPlayer("Tony Kelly")).toEqual(
      expect.objectContaining({ hair: "quiff", hairColor: "sandy" }),
    );
    expect(lookForPlayer("Shane O'Donnell")?.hair).toBe("shaggy");
    expect(lookForPlayer("Peter Duggan")?.build).toBe("broad");
    expect(lookForPlayer("Not A Real Hurler")).toBeNull();
    expect(ratedSquad("ballyea").some((player) => lookForPlayer(player.name))).toBe(true);
    expect(ratedSquad("ballyea").some((player) => !lookForPlayer(player.name))).toBe(true);
  });
});
