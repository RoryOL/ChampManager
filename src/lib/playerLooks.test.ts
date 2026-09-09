import { describe, expect, it } from "vitest";
import { createAvatar } from "@dicebear/core";
import * as adventurer from "@dicebear/adventurer";
import { generatedLook, lookForPlayer, portraitHair } from "./playerLooks";
import { ratedSquad } from "./players";

describe("generated player portraits", () => {
  it("is stable for a name and varies across the panel", () => {
    expect(generatedLook("Cian Kirby")).toEqual(generatedLook("Cian Kirby"));
    expect(lookForPlayer("Tony Kelly").hair).toBe("quiff");
    expect(lookForPlayer("Cian Kirby")).toEqual(generatedLook("Cian Kirby"));
    const looks = ratedSquad("clooney-quin").map((player) => JSON.stringify(lookForPlayer(player.name)));
    expect(new Set(looks).size).toBeGreaterThan(10);
  });

  it("builds an svg portrait from a name", () => {
    const svg = createAvatar(adventurer, {
      seed: "Tony Kelly",
      hair: portraitHair("quiff"),
    }).toString();
    expect(svg).toContain("<svg");
    expect(svg.length).toBeGreaterThan(500);
  });
});
