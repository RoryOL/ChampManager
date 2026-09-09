import { describe, expect, it } from "vitest";
import { generatedLook, lookForPlayer } from "./playerLooks";
import { ratedSquad } from "./players";

describe("generated player portraits", () => {
  it("is stable for a name and varies across the panel", () => {
    expect(generatedLook("Cian Kirby")).toEqual(generatedLook("Cian Kirby"));
    expect(lookForPlayer("Tony Kelly").hair).toBe("quiff");
    expect(lookForPlayer("Cian Kirby")).toEqual(generatedLook("Cian Kirby"));
    const looks = ratedSquad("clooney-quin").map((player) => JSON.stringify(lookForPlayer(player.name)));
    expect(new Set(looks).size).toBeGreaterThan(10);
  });
});
