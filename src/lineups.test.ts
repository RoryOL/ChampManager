import { describe, expect, it } from "vitest";
import { seedChampionship } from "./data/championship";
import { matchLineups } from "./data/lineups";
import { latestLineup, lineupsForMatch, squadFor } from "./lib/squads";

describe("2026 championship line-outs", () => {
  it("records a fifteen for every senior club", () => {
    for (const team of seedChampionship.teams) {
      const xv = latestLineup(team.id);
      expect(xv, team.name).toBeDefined();
      expect(xv?.starters).toHaveLength(15);
    }
  });

  it("keeps both sides of round 3 ties", () => {
    const roundThree = [
      "g1-r3-a",
      "g1-r3-b",
      "g2-r3-a",
      "g2-r3-b",
      "g3-r3-a",
      "g3-r3-b",
      "g4-r3-a",
      "g4-r3-b",
    ];
    for (const matchId of roundThree) {
      expect(lineupsForMatch(matchId)).toHaveLength(2);
    }
  });

  it("puts Tony Kelly in the latest Ballyea fifteen", () => {
    const names = latestLineup("ballyea")?.starters.map((player) => player.name);
    expect(names).toContain("Tony Kelly");
  });

  it("builds a Scariff panel from more than one championship outing", () => {
    const squad = squadFor("scariff");
    expect(squad.some((player) => player.name === "Mark Rodgers")).toBe(true);
    expect(squad.some((player) => player.name === "Patrick Ryan")).toBe(true);
    expect(squad.find((player) => player.name === "Paul Rodgers")?.starts).toBe(2);
  });

  it("only stores numbered players from published reports", () => {
    for (const lineup of matchLineups) {
      for (const player of [...lineup.starters, ...lineup.subs]) {
        expect(player.number).toBeGreaterThan(0);
        expect(player.name.length).toBeGreaterThan(2);
      }
    }
  });
});
