import { describe, expect, it } from "vitest";
import { seedChampionship } from "./data/championship";
import {
  addDays,
  decisiveResult,
  insertReplay,
  isKnockoutStage,
  knockoutNeedsExtraTime,
  nextReplayId,
  periodClock,
  replayFixture,
} from "./lib/knockout";
import { applyKnockoutExtraTime, simulateMatch } from "./lib/matchEngine";
import { championshipFromSave, newSave } from "./lib/gameStorage";
import { defaultSheet } from "./lib/players";
import { resolveMatchSides, resolveTeamId } from "./lib/resolve";

describe("knockout extra time and replays", () => {
  it("gives two ten-minute extra-time periods", () => {
    expect(periodClock("et1")).toEqual({ startMinute: 63, endMinute: 72, periodMinutes: 10 });
    expect(periodClock("et2")).toEqual({ startMinute: 73, endMinute: 82, periodMinutes: 10 });
  });

  it("plays extra time from 63 to 82 on a level knockout", () => {
    const et1 = simulateMatch({
      matchId: "qf-1",
      homeId: "ballyea",
      awayId: "eire-og",
      homeSheet: defaultSheet("ballyea"),
      awaySheet: defaultSheet("eire-og"),
      period: "et1",
      startHome: { goals: 1, points: 14 },
      startAway: { goals: 2, points: 11 },
      seed: 11,
      stage: "quarter-final",
    });
    expect(et1.events.some((event) => event.minute === 72 && event.kind === "half")).toBe(true);
    expect(et1.events.every((event) => event.minute >= 63)).toBe(true);
    const et2 = simulateMatch({
      matchId: "qf-1",
      homeId: "ballyea",
      awayId: "eire-og",
      period: "et2",
      startHome: et1.homeScore,
      startAway: et1.awayScore,
      seed: 11,
      stage: "quarter-final",
    });
    expect(et2.events.some((event) => event.minute === 82 && event.kind === "full")).toBe(true);

    const sim = simulateMatch({
      matchId: "qf-1",
      homeId: "ballyea",
      awayId: "eire-og",
      period: "full",
      seed: 11,
      stage: "quarter-final",
    });
    const level = {
      ...sim,
      homeScore: { goals: 1, points: 14 },
      awayScore: { goals: 2, points: 11 },
    };
    expect(knockoutNeedsExtraTime("quarter-final", level.homeScore, level.awayScore)).toBe(true);
    const extra = applyKnockoutExtraTime(level, { seed: 11, stage: "quarter-final" });
    expect(extra.events.some((event) => event.minute >= 63)).toBe(true);
  });

  it("does not add extra time to a group-stage draw", () => {
    const sim = simulateMatch({
      matchId: "g1-r1-a",
      homeId: "ballyea",
      awayId: "eire-og",
      period: "full",
      seed: 3,
      stage: "group",
    });
    const level = { ...sim, homeScore: { goals: 0, points: 12 }, awayScore: { goals: 1, points: 9 } };
    const extra = applyKnockoutExtraTime(level, { seed: 3, stage: "group" });
    expect(extra.events.some((event) => event.minute >= 63)).toBe(false);
    expect(isKnockoutStage("group")).toBe(false);
  });

  it("schedules a replay a week later and lets the winner of that replay advance", () => {
    expect(addDays("2026-09-13", 7)).toBe("2026-09-20");
    expect(nextReplayId([{ id: "qf-1" }], "qf-1")).toBe("qf-1-replay");
    const original = {
      id: "sf-test",
      stage: "semi-final" as const,
      date: "2026-09-27",
      home: { type: "team" as const, teamId: "ballyea" },
      away: { type: "team" as const, teamId: "sixmilebridge" },
      homeScore: { goals: 1, points: 12 },
      awayScore: { goals: 0, points: 15 },
    };
    const replay = replayFixture(original, "ballyea", "sixmilebridge", [original]);
    expect(replay.replayOf).toBe("sf-test");
    expect(replay.date).toBe("2026-10-04");
    expect(replay.home).toEqual({ type: "team", teamId: "ballyea" });
    const championship = {
      ...seedChampionship,
      matches: [
        ...seedChampionship.matches,
        original,
        { ...replay, homeScore: { goals: 2, points: 14 }, awayScore: { goals: 1, points: 10 } },
      ],
    };
    expect(decisiveResult(championship, original)).toBe("home");
    expect(resolveTeamId(championship, { type: "winner", matchId: "sf-test" })).toBe("ballyea");
    expect(resolveTeamId(championship, { type: "loser", matchId: "sf-test" })).toBe("sixmilebridge");
  });

  it("hydrates extra replay fixtures from a save", () => {
    const save = newSave("ballyea");
    const qf = seedChampionship.matches.find((item) => item.id === "qf-1")!;
    const replay = replayFixture(qf, "ballyea", "sixmilebridge", seedChampionship.matches);
    const hydrated = championshipFromSave({
      ...save,
      extraMatches: [replay],
      matches: [...save.matches, { id: replay.id, homeScore: null, awayScore: null }],
    });
    expect(hydrated.matches.some((item) => item.id === replay.id)).toBe(true);
    const replayRow = hydrated.matches.find((item) => item.id === replay.id);
    const qfIndex = hydrated.matches.findIndex((item) => item.id === "qf-4");
    const replayIndex = hydrated.matches.findIndex((item) => item.id === replay.id);
    expect(replayIndex).toBeGreaterThan(qfIndex);
    expect(replayRow?.replayOf).toBe("qf-1");
  });

  it("resolves sides for a replay weekend", () => {
    const qf = seedChampionship.matches.find((item) => item.id === "qf-1")!;
    const replay = replayFixture(qf, "kilmaley", "cloonlara", seedChampionship.matches);
    const championship = {
      ...seedChampionship,
      matches: insertReplay(seedChampionship.matches, replay),
    };
    expect(resolveMatchSides(championship, replay)).toEqual({ homeId: "kilmaley", awayId: "cloonlara" });
  });
});
