import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generatedLook, lookForPlayer } from "./playerLooks";
import { PORTRAIT_FACES, portraitId } from "./portraitPack";
import { ratedSquad } from "./players";

describe("generated player portraits", () => {
  it("is stable for a name and varies across the panel", () => {
    expect(generatedLook("Cian Kirby")).toEqual(generatedLook("Cian Kirby"));
    expect(lookForPlayer("Tony Kelly").hair).toBe("quiff");
    expect(lookForPlayer("Cian Kirby")).toEqual(generatedLook("Cian Kirby"));
    const looks = ratedSquad("clooney-quin").map((player) => JSON.stringify(lookForPlayer(player.name)));
    expect(new Set(looks).size).toBeGreaterThan(10);
  });

  it("picks a photoreal face that matches known traits", () => {
    expect(portraitId("Tony Kelly", 32)).toMatch(/sandy_quiff/);
    expect(portraitId("Shane O'Donnell", 28)).toBe("fair_shaggy_none");
    expect(portraitId("Tony Kelly", 32)).toBe(portraitId("Tony Kelly", 32));
    const ids = ratedSquad("clooney-quin").map((player) => portraitId(player.name, player.age));
    expect(new Set(ids).size).toBeGreaterThan(8);
  });

  it("ships a jpeg for every face in the pack", () => {
    for (const face of PORTRAIT_FACES) {
      expect(existsSync(`public/portraits/${face.id}.jpg`)).toBe(true);
    }
  });
});
