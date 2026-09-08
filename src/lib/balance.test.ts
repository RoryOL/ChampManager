import { describe, expect, it } from "vitest";
import { seedChampionship } from "../data/championship";
import { migrateBalance } from "./balance";
import { simulateChampionship } from "./championshipSim";
import { newSave } from "./gameStorage";
import { clubTactics, clubXvOverall, ratedSquad } from "./players";

describe("balanced panels", () => {
  it("treats missing saves as standard", () => {
    expect(migrateBalance(undefined)).toBe("standard");
    expect(migrateBalance("balanced")).toBe("balanced");
    expect(newSave("ballyea").balance).toBe("standard");
    expect(newSave("ballyea", "senior", "balanced").balance).toBe("balanced");
  });

  it("keeps Tony Kelly the best Ballyea player after the clubs are levelled", () => {
    const ctx = { seed: 7, balance: "balanced" as const };
    const squad = ratedSquad("ballyea", ctx);
    const kelly = squad.find((player) => player.name === "Tony Kelly");
    expect(kelly).toBeTruthy();
    const best = Math.max(...squad.map((player) => player.ratings.overall));
    expect(kelly!.ratings.overall).toBe(best);
    expect(kelly!.ratings.overall).toBeGreaterThanOrEqual(16);
    const standard = ratedSquad("ballyea", 7).find((player) => player.name === "Tony Kelly");
    expect(kelly!.ratings.overall).toBeLessThanOrEqual(standard!.ratings.overall);
  });

  it("gives every computer club the same starting plan in balanced mode", () => {
    expect(clubTactics("ballyea", "balanced")).toEqual(clubTactics("broadford", "balanced"));
    expect(clubTactics("ballyea")).not.toEqual(clubTactics("broadford"));
  });

  it("pulls starting fifteens toward the same overall", () => {
    const spread = (balance: "standard" | "balanced") => {
      const means = seedChampionship.teams.map((team) =>
        clubXvOverall(team.id, ratedSquad(team.id, { seed: 11, balance })),
      );
      return { min: Math.min(...means), max: Math.max(...means), means };
    };
    const standard = spread("standard");
    const balanced = spread("balanced");
    expect(standard.max - standard.min).toBeGreaterThan(1.2);
    expect(balanced.max - balanced.min).toBeLessThan(0.55);
    const eireOg = clubXvOverall("eire-og", ratedSquad("eire-og", { seed: 11, balance: "balanced" }));
    const broadford = clubXvOverall("broadford", ratedSquad("broadford", { seed: 11, balance: "balanced" }));
    expect(Math.abs(eireOg - broadford)).toBeLessThan(0.45);
  });

  it("still produces a county champion from a simulated season", () => {
    const { championId, championship } = simulateChampionship({ seed: 44, balance: "balanced" });
    expect(championId).toBeTruthy();
    expect(seedChampionship.teams.some((team) => team.id === championId)).toBe(true);
    const final = championship.matches.find((match) => match.id === "final");
    expect(final?.homeScore).toBeTruthy();
    expect(final?.awayScore).toBeTruthy();
  });
});
