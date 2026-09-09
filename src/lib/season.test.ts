import { describe, expect, it } from "vitest";
import { championshipFromSave, migrateSave, newSave } from "./gameStorage";
import { simulateChampionship } from "./championshipSim";
import {
  championshipDecidingMatch,
  championshipWinnerId,
  championshipWithChampion,
  seasonFinaleStep,
} from "./season";

describe("season finale", () => {
  it("names the county champion from the final", () => {
    const championship = championshipWithChampion("ballyea", "eire-og");
    expect(championshipWinnerId(championship)).toBe("ballyea");
    expect(championshipDecidingMatch(championship)?.id).toBe("final");
    expect(seasonFinaleStep("ballyea")).toBe("ceremony");
    expect(seasonFinaleStep("ballyea", "offer")).toBe("offer");
    expect(seasonFinaleStep("ballyea", "done")).toBe("done");
    expect(seasonFinaleStep(null)).toBeNull();
  });

  it("waits on a replay before naming a champion", () => {
    const championship = championshipWithChampion("sixmilebridge", "clonlara", { replay: true });
    expect(championshipWinnerId(championship)).toBe("sixmilebridge");
    expect(championshipDecidingMatch(championship)?.replayOf).toBe("final");
    const drawn = championshipWithChampion("ballyea", "eire-og");
    const final = drawn.matches.find((item) => item.id === "final")!;
    final.homeScore = { goals: 1, points: 12 };
    final.awayScore = { goals: 0, points: 15 };
    expect(championshipWinnerId(drawn)).toBeNull();
  });

  it("keeps the wrap flag on a migrated save", () => {
    const migrated = migrateSave({ ...newSave("ballyea"), seasonWrap: "done" });
    expect(migrated?.seasonWrap).toBe("done");
  });

  it("reads a champion off a hydrated save after the county final", () => {
    const { championId, championship } = simulateChampionship({ seed: 9 });
    expect(championId).toBeTruthy();
    const save = championshipFromSave({
      ...newSave("ballyea"),
      matches: championship.matches.map((match) => ({
        id: match.id,
        homeScore: match.homeScore,
        awayScore: match.awayScore,
      })),
      extraMatches: championship.matches.filter((match) => Boolean(match.replayOf)),
    });
    expect(championshipWinnerId(save)).toBe(championId);
  });
});
