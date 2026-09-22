import { describe, expect, it } from "vitest";
import { seedChampionship } from "../data/championship";
import { newSave } from "./gameStorage";
import { continueChampionship } from "./development";
import { computeOverall, ratedSquad } from "./players";
import { STAR_OVERALL, ratingsForOverall, retirementChance } from "./turnover";
import type { GameSave } from "../types";

function withMinutes(save: GameSave, clubId: string, played: string[], games: number): GameSave {
  const reports: GameSave["reports"] = {};
  for (let game = 0; game < games; game += 1) {
    reports[`${clubId}-${game}`] = {
      players: played.map((name) => ({ teamId: clubId, name, minutes: 50, goals: 0, points: 0, rating: 7 })),
    } as unknown as GameSave["reports"][string];
  }
  return { ...save, reports };
}

describe("retirement chance", () => {
  it("stays shut at 30 and when the club has no recorded games", () => {
    expect(retirementChance(30, 0, 5, 8)).toBe(0);
    expect(retirementChance(38, 0, 0, 8)).toBe(0);
  });

  it("is likely for an unused player over 30, and unlikely for a star who played the summer", () => {
    expect(retirementChance(32, 0, 5, 11)).toBeGreaterThan(0.55);
    expect(retirementChance(32, 0, 5, 18)).toBeGreaterThan(0.5);
    expect(retirementChance(32, 5, 5, 18)).toBeLessThan(0.1);
    expect(retirementChance(36, 2, 5, 12)).toBeGreaterThan(retirementChance(32, 2, 5, 12));
    expect(retirementChance(34, 0, 5, 9)).toBeGreaterThan(retirementChance(34, 0, 5, 18));
  });
});

describe("panel turnover", () => {
  it("builds a youth card on the overall it was asked for", () => {
    const card = ratingsForOverall("HF", 17, 11, true);
    expect(computeOverall(card.ratings, card.familiarity, "HF")).toBe(17);
    expect(card.familiarity.HF).toBeGreaterThanOrEqual(16);
  });

  it("retires an unused veteran and keeps a star who played", () => {
    let conlonGone = 0;
    let tonyGone = 0;
    for (let seed = 1; seed <= 24; seed += 1) {
      const base = { ...newSave("clonlara"), seed };
      const conlonClub = withMinutes(
        base,
        "clonlara",
        ratedSquad("clonlara", base)
          .map((player) => player.name)
          .filter((name) => name !== "John Conlon"),
        4,
      );
      const afterConlon = continueChampionship(conlonClub);
      if (!ratedSquad("clonlara", afterConlon).some((player) => player.name === "John Conlon")) conlonGone += 1;

      const tonyBase = { ...newSave("ballyea"), seed };
      const tonyClub = withMinutes(
        tonyBase,
        "ballyea",
        ratedSquad("ballyea", tonyBase).map((player) => player.name),
        5,
      );
      const afterTony = continueChampionship(tonyClub);
      if (!ratedSquad("ballyea", afterTony).some((player) => player.name === "Tony Kelly")) tonyGone += 1;
    }
    expect(conlonGone).toBeGreaterThan(16);
    expect(tonyGone).toBeLessThan(2);
  });

  it("replaces a departed star and keeps squad sizes near the original panel", () => {
    let gone = 0;
    for (let seed = 1; seed <= 12; seed += 1) {
      const base = { ...newSave("ballyea"), seed };
      const opening = seedChampionship.teams.map((team) => ({
        id: team.id,
        size: ratedSquad(team.id, base).length,
      }));
      const openingStars = seedChampionship.teams.reduce(
        (sum, team) => sum + ratedSquad(team.id, base).filter((player) => player.ratings.overall >= STAR_OVERALL).length,
        0,
      );
      const played = withMinutes(
        base,
        "ballyea",
        ratedSquad("ballyea", base)
          .map((player) => player.name)
          .filter((name) => name !== "Tony Kelly"),
        5,
      );
      const next = continueChampionship(played);
      const squad = ratedSquad("ballyea", next);
      if (squad.some((player) => player.name === "Tony Kelly")) continue;
      gone += 1;
      expect(squad.some((player) => player.age <= 21 && player.ratings.overall >= STAR_OVERALL)).toBe(true);
      const starsNow = seedChampionship.teams.reduce(
        (sum, team) => sum + ratedSquad(team.id, next).filter((player) => player.ratings.overall >= STAR_OVERALL).length,
        0,
      );
      expect(starsNow).toBeGreaterThanOrEqual(openingStars - 1);
      for (const club of opening) {
        expect(Math.abs(ratedSquad(club.id, next).length - club.size)).toBeLessThanOrEqual(2);
      }
      expect(next.condition["Tony Kelly"]).toBeUndefined();
      expect(next.inbox[0]?.body).toMatch(/Tony Kelly/);
    }
    expect(gone).toBeGreaterThan(6);
  });
});
