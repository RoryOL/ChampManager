import { describe, expect, it } from "vitest";
import { DEFAULT_TACTICS, defaultSheet } from "./players";
import { defaultCondition } from "./training";
import {
  createManagedClub,
  pairChallengeMatches,
  pickCpuHalfPlan,
  pickCpuSheet,
  pickCpuTactics,
  seedRivals,
  tickManagedPreseasonWeek,
} from "./aiManager";
import { newSave, migrateSave } from "./gameStorage";
import type { SimulatedMatch } from "../types";

describe("computer club manager", () => {
  it("seeds a managed club with personality tactics and starting form", () => {
    const club = createManagedClub("eire-og", 11);
    expect(club.tactics).not.toEqual(DEFAULT_TACTICS);
    expect(club.weekShape).toBe("challenge");
    expect(club.sheet.starters).toHaveLength(15);
    const forms = Object.values(club.condition).map((row) => row.form);
    expect(forms.some((value) => typeof value === "number")).toBe(true);
  });

  it("sits an injured starter when picking the fifteen", () => {
    const sheet = defaultSheet("ballyea");
    const name = sheet.starters[3]!;
    const picked = pickCpuSheet({
      teamId: "ballyea",
      seed: 4,
      matchKey: "injury-test",
      condition: {
        [name]: {
          ...defaultCondition(),
          injury: { weeksLeft: 3, durationWeeks: 3, ailment: "hamstring", source: "match" },
        },
      },
    });
    expect(picked.starters).not.toContain(name);
    expect(picked.starters).toHaveLength(15);
  });

  it("changes setup against a sweeper and against a long-ball side", () => {
    const climate = { sky: "sunny" as const, windStrength: 10, windAngle: 0 };
    const vsSweeper = pickCpuTactics({
      teamId: "ballyea",
      opponentId: "eire-og",
      seed: 9,
      matchKey: "same-day",
      climate,
      opponentTactics: { ...DEFAULT_TACTICS, shape: "sweeper", build: 28, puckout: 24, pressure: 40 },
    });
    const vsDirect = pickCpuTactics({
      teamId: "ballyea",
      opponentId: "eire-og",
      seed: 9,
      matchKey: "same-day",
      climate,
      opponentTactics: { ...DEFAULT_TACTICS, shape: "traditional", build: 82, puckout: 80, pressure: 30 },
    });
    expect(vsSweeper.shooting).toBeLessThan(vsDirect.shooting);
    expect(vsSweeper.build).toBeLessThanOrEqual(vsDirect.build);
  });

  it("pushes on after half-time when the computer is well behind", () => {
    const first = {
      matchId: "g1-r1-a",
      homeId: "ballyea",
      awayId: "eire-og",
      homeScore: { goals: 0, points: 3 },
      awayScore: { goals: 2, points: 12 },
      events: [],
      homeTactics: { ...DEFAULT_TACTICS, mentality: "balanced" as const },
      awayTactics: DEFAULT_TACTICS,
      homeSheet: defaultSheet("ballyea"),
      awaySheet: defaultSheet("eire-og"),
      homeStats: { scores: 3, wides: 1, hooks: 0, frees: 0, bookings: 0 },
      awayStats: { scores: 18, wides: 1, hooks: 0, frees: 0, bookings: 0 },
      players: [],
      coachReport: [],
      climate: { sky: "sunny" as const, windStrength: 10, windAngle: 0 },
      shots: [],
    } as unknown as SimulatedMatch;
    const plan = pickCpuHalfPlan({
      teamId: "ballyea",
      first,
      side: "home",
      condition: {},
      seed: 2,
    });
    expect(plan.tactics.mentality).toBe("attacking");
    expect(plan.tactics.shape).toBe("traditional");
  });

  it("pairs computer clubs for preseason challenges", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const pairs = pairChallengeMatches(ids, 1, 3);
    expect(pairs).toHaveLength(2);
    const used = pairs.flatMap((pair) => [pair.homeId, pair.awayId]);
    expect(new Set(used).size).toBe(4);
  });

  it("trains computer clubs and plays challenge matches in a preseason week", () => {
    const rivals = seedRivals("ballyea", 8);
    const ids = Object.keys(rivals);
    const next = tickManagedPreseasonWeek(rivals, ids, { seed: 8, week: 1, remainingWeeks: 10 });
    const sample = next["eire-og"]!;
    const sharpness = Object.values(sample.condition).some((row) => (row.sharpness ?? 0) > 38);
    const tired = Object.values(sample.condition).some((row) => (row.fatigue ?? 0) > 0);
    expect(sharpness || tired).toBe(true);
    expect(sample.sessionsDone).toBe(0);
  });

  it("puts rival runtimes on a new save and migrates old saves to version 10", () => {
    const fresh = newSave("ballyea");
    expect(fresh.version).toBe(10);
    expect(Object.keys(fresh.rivals)).toHaveLength(15);
    expect(fresh.rivals.ballyea).toBeUndefined();
    expect(fresh.rivals["eire-og"]?.sheet.starters).toHaveLength(15);

    const migrated = migrateSave({
      version: 9,
      clubId: "ballyea",
      seed: 3,
      tactics: { mentality: "balanced", build: 40, puckout: 40, aggression: 40, pressure: 40, shooting: 50, shape: "traditional" },
      sheet: defaultSheet("ballyea"),
      matches: [],
      inbox: [],
    });
    expect(migrated?.version).toBe(10);
    expect(Object.keys(migrated?.rivals ?? {})).toHaveLength(15);
  });
});
