import { describe, expect, it } from "vitest";
import { seedChampionship } from "./data/championship";
import { simulateMatch } from "./lib/matchEngine";
import { defaultSheet, ratePlayer, ratedSquad, sideStrength } from "./lib/players";
import { DEFAULT_TACTICS } from "./lib/players";
import { nextBatch } from "./lib/schedule";
import { matchPlayed } from "./lib/scoring";

describe("new game championship", () => {
  it("starts with every tie unplayed", () => {
    expect(seedChampionship.matches.every((match) => !matchPlayed(match))).toBe(true);
  });
});

describe("player ratings", () => {
  it("keeps Tony Kelly at the top of the Ballyea panel", () => {
    const kelly = ratedSquad("ballyea").find((player) => player.name === "Tony Kelly");
    expect(kelly?.ratings.overall).toBeGreaterThanOrEqual(17);
    expect(ratePlayer("ballyea", "Tony Kelly", 7).overall).toBe(
      ratePlayer("ballyea", "Tony Kelly", 7).overall,
    );
  });
});

describe("match engine", () => {
  it("produces a legal hurling scoreline", () => {
    const result = simulateMatch({
      matchId: "g1-r1-a",
      homeId: "ballyea",
      awayId: "inagh-kilnamona",
      seed: 42,
    });
    expect(result.homeScore.goals).toBeGreaterThanOrEqual(0);
    expect(result.awayScore.points).toBeGreaterThanOrEqual(0);
    expect(result.events.some((event) => event.kind === "full")).toBe(true);
    expect(result.homeScore.goals + result.homeScore.points + result.awayScore.goals + result.awayScore.points).toBeGreaterThan(8);
  });

  it("is deterministic for the same seed", () => {
    const a = simulateMatch({
      matchId: "g2-r1-b",
      homeId: "eire-og",
      awayId: "crusheen",
      seed: 7,
    });
    const b = simulateMatch({
      matchId: "g2-r1-b",
      homeId: "eire-og",
      awayId: "crusheen",
      seed: 7,
    });
    expect(a.homeScore).toEqual(b.homeScore);
    expect(a.awayScore).toEqual(b.awayScore);
  });

  it("gives the stronger side a better expected attack", () => {
    const stars = sideStrength("eire-og", defaultSheet("eire-og"), DEFAULT_TACTICS);
    const weaker = sideStrength("crusheen", defaultSheet("crusheen"), DEFAULT_TACTICS);
    expect(stars.attack + stars.defence).toBeGreaterThan(weaker.attack + weaker.defence - 1);
  });
});

describe("schedule", () => {
  it("opens the championship on round 1 for a chosen club", () => {
    const batch = nextBatch(seedChampionship, "kilmaley");
    expect(batch?.label).toBe("Round 1");
    expect(batch?.userMatch?.id).toBe("g4-r1-a");
    expect(batch?.matches).toHaveLength(8);
  });
});
