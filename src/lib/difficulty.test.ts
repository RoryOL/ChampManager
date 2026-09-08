import { describe, expect, it } from "vitest";
import { DEFAULT_TACTICS, defaultSheet, ratedSquad } from "./players";
import {
  assumedOpponentTactics,
  blendTactics,
  cpuAdaptWeight,
  cpuHalfTimeSkill,
  inferOpponentTactics,
  liftSquadRatings,
  migrateDifficulty,
  performanceLift,
} from "./difficulty";
import type { MatchReport } from "../types";

describe("difficulty", () => {
  it("gives the human panel a lift on junior and intermediate only", () => {
    expect(performanceLift("junior")).toBe(2);
    expect(performanceLift("intermediate")).toBe(1);
    expect(performanceLift("senior")).toBe(0);
    expect(performanceLift("intercounty")).toBe(0);
  });

  it("keeps computer managers simple on junior and fully adapted on senior", () => {
    expect(cpuAdaptWeight("junior")).toBe(0);
    expect(cpuAdaptWeight("intermediate")).toBe(0.4);
    expect(cpuAdaptWeight("senior")).toBe(1);
    expect(cpuHalfTimeSkill("junior")).toBe("none");
    expect(cpuHalfTimeSkill("intermediate")).toBe("late");
    expect(cpuHalfTimeSkill("senior")).toBe("full");
    expect(cpuHalfTimeSkill("intercounty")).toBe("scout");
  });

  it("treats missing saves as senior", () => {
    expect(migrateDifficulty(undefined)).toBe("senior");
    expect(migrateDifficulty("junior")).toBe("junior");
  });

  it("blends tactics toward the match plan", () => {
    const adapted = { ...DEFAULT_TACTICS, mentality: "attacking" as const, shooting: 20, build: 80 };
    expect(blendTactics(DEFAULT_TACTICS, adapted, 0)).toEqual(DEFAULT_TACTICS);
    expect(blendTactics(DEFAULT_TACTICS, adapted, 1).mentality).toBe("attacking");
    expect(blendTactics(DEFAULT_TACTICS, adapted, 0.4).mentality).toBe(DEFAULT_TACTICS.mentality);
    expect(blendTactics(DEFAULT_TACTICS, adapted, 0.4).build).toBeGreaterThan(DEFAULT_TACTICS.build);
  });

  it("infers opponent tactics from a previous report", () => {
    const report = {
      matchId: "g1-r1-a",
      homeId: "ballyea",
      awayId: "eire-og",
      homeScore: { goals: 1, points: 12 },
      awayScore: { goals: 0, points: 10 },
      homeTactics: { ...DEFAULT_TACTICS, shape: "sweeper" as const, shooting: 22 },
      awayTactics: DEFAULT_TACTICS,
      homeSheet: defaultSheet("ballyea"),
      awaySheet: defaultSheet("eire-og"),
      homeStats: { scores: 15, wides: 1, hooks: 0, frees: 0, bookings: 0 },
      awayStats: { scores: 10, wides: 1, hooks: 0, frees: 0, bookings: 0 },
      players: [],
      coachReport: [],
    } as unknown as MatchReport;
    expect(inferOpponentTactics({ "g1-r1-a": report }, "ballyea", "eire-og")?.shape).toBe("sweeper");
    expect(assumedOpponentTactics("intercounty", DEFAULT_TACTICS, report.homeTactics, DEFAULT_TACTICS).shape).toBe(
      "sweeper",
    );
    expect(assumedOpponentTactics("senior", { ...DEFAULT_TACTICS, shape: "traditional" }, report.homeTactics, DEFAULT_TACTICS).shape).toBe(
      "traditional",
    );
  });

  it("lifts squad ratings for a match without mutating the original", () => {
    const squad = ratedSquad("ballyea", 4);
    const original = squad[0]!.ratings.shooting;
    const lifted = liftSquadRatings(squad, 2);
    expect(lifted[0]!.ratings.shooting).toBe(Math.min(20, original + 2));
    expect(squad[0]!.ratings.shooting).toBe(original);
    expect(liftSquadRatings(squad, 0)).toBe(squad);
  });
});
