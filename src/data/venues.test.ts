import { describe, expect, it } from "vitest";
import { seedChampionship } from "./championship";
import { CHAMPIONSHIP_GROUNDS, ENNIS_VENUE, isEnnisStage } from "./venues";
import { replayFixture } from "../lib/knockout";

describe("championship venues", () => {
  it("gives every fixture a ground from the 2026 list", () => {
    for (const match of seedChampionship.matches) {
      expect(match.venue, match.id).toBeTruthy();
      expect(CHAMPIONSHIP_GROUNDS, match.id).toContain(match.venue);
    }
  });

  it("locks semi-finals and the county final to Ennis", () => {
    const lastFour = seedChampionship.matches.filter((match) => isEnnisStage(match.stage));
    expect(lastFour.length).toBe(3);
    for (const match of lastFour) {
      expect(match.venue).toBe(ENNIS_VENUE);
    }
  });

  it("sends quarter-finals to different grounds, not Ennis", () => {
    const quarters = seedChampionship.matches.filter((match) => match.stage === "quarter-final");
    expect(quarters).toHaveLength(4);
    const venues = new Set(quarters.map((match) => match.venue));
    expect(venues.size).toBeGreaterThan(1);
    expect(venues.has(ENNIS_VENUE)).toBe(false);
  });

  it("keeps a semi-final replay in Ennis", () => {
    const semi = seedChampionship.matches.find((match) => match.id === "sf-1")!;
    const replay = replayFixture(semi, "ballyea", "kilmaley", seedChampionship.matches);
    expect(replay.venue).toBe(ENNIS_VENUE);
  });
});
