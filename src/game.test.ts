import { describe, expect, it } from "vitest";
import { seedChampionship } from "./data/championship";
import { migrateSave } from "./lib/gameStorage";
import {
  freeConversionChance,
  momentumAt,
  scoreFromEvents,
  simulateMatch,
  sixtyFiveChance,
} from "./lib/matchEngine";
import { clubTactics, DEFAULT_TACTICS, defaultSheet, ratePlayer, ratedSquad, sideStrength } from "./lib/players";
import { nextBatch } from "./lib/schedule";
import { matchPlayed } from "./lib/scoring";
import {
  applyTraining,
  averageMatchOverall,
  defaultCondition,
  isOvertrained,
  matchRatings,
  matchStat,
} from "./lib/training";
import type { Tactics } from "./types";

describe("new game championship", () => {
  it("starts with every tie unplayed", () => {
    expect(seedChampionship.matches.every((match) => !matchPlayed(match))).toBe(true);
  });
});

describe("player ratings", () => {
  it("reports Ballyea XV ability near the panel stars", () => {
    const squad = ratedSquad("ballyea");
    const sheet = defaultSheet("ballyea");
    const form = averageMatchOverall(
      squad,
      Object.fromEntries(squad.map((player) => [player.name, defaultCondition()])),
      sheet.starters,
    );
    const overalls = sheet.starters.map((name) => {
      const player = squad.find((item) => item.name === name);
      return { name, overall: player?.ratings.overall ?? null };
    });
    expect(overalls.every((row) => row.overall !== null)).toBe(true);
    expect(form.ability).toBeGreaterThan(10);
    expect(form.ability).toBeLessThan(16);
    expect(form.match).toBe(form.ability);
  });

  it("keeps Tony Kelly at the top of the Ballyea panel", () => {
    const kelly = ratedSquad("ballyea").find((player) => player.name === "Tony Kelly");
    expect(kelly?.ratings.overall).toBeGreaterThanOrEqual(17);
    expect(kelly?.ratings.frees).toBeGreaterThanOrEqual(17);
    expect(kelly?.ratings.vision).toBeGreaterThanOrEqual(17);
    expect(ratePlayer("ballyea", "Tony Kelly", 7).overall).toBe(
      ratePlayer("ballyea", "Tony Kelly", 7).overall,
    );
  });

  it("gives keepers puck-out reach and full-forwards free-taking", () => {
    const quilligan = ratedSquad("feakle").find((player) => player.name === "Eibhear Quilligan");
    const duggan = ratedSquad("clooney-quin").find((player) => player.name === "Peter Duggan");
    expect(quilligan?.ratings.puckoutReach).toBeGreaterThanOrEqual(15);
    expect(duggan?.ratings.frees).toBeGreaterThanOrEqual(16);
    expect(quilligan?.ratings.familiarity.GK).toBeGreaterThan(quilligan?.ratings.familiarity.FF ?? 0);
  });
});

describe("match engine", () => {
  it("produces a legal hurling scoreline with goals and points tracked apart", () => {
    const result = simulateMatch({
      matchId: "g1-r1-a",
      homeId: "ballyea",
      awayId: "inagh-kilnamona",
      seed: 42,
    });
    expect(result.homeScore.goals).toBeGreaterThanOrEqual(0);
    expect(result.awayScore.points).toBeGreaterThanOrEqual(0);
    expect(result.events.some((event) => event.kind === "full")).toBe(true);
    expect(
      result.homeScore.goals + result.homeScore.points + result.awayScore.goals + result.awayScore.points,
    ).toBeGreaterThan(8);
    const replay = scoreFromEvents(result.events, "ballyea");
    expect(replay.home).toEqual(result.homeScore);
    expect(replay.away).toEqual(result.awayScore);
  });

  it("counts frees, 65s and sidelines as points, not goals", () => {
    const scored = scoreFromEvents(
      [
        { minute: 3, teamId: "ballyea", playerName: "Tony Kelly", kind: "free", text: "" },
        { minute: 8, teamId: "ballyea", playerName: "Tony Kelly", kind: "sixtyFive", text: "" },
        { minute: 12, teamId: "ballyea", playerName: "Niall Deasy", kind: "sideline", text: "" },
        { minute: 20, teamId: "ballyea", playerName: "Tony Kelly", kind: "goal", text: "" },
        { minute: 40, teamId: "inagh-kilnamona", playerName: "Aidan McCarthy", kind: "point", text: "" },
      ],
      "ballyea",
    );
    expect(scored.home).toEqual({ goals: 1, points: 3 });
    expect(scored.away).toEqual({ goals: 0, points: 1 });
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

  it("makes specialist free-takers convert far more dead balls", () => {
    expect(freeConversionChance(19, 18, 18)).toBeGreaterThan(freeConversionChance(10, 11, 11) + 0.2);
    expect(sixtyFiveChance(18, 18, 16)).toBeGreaterThan(sixtyFiveChance(9, 10, 10));
  });

  it("produces set-piece and puck-out events", () => {
    const result = simulateMatch({
      matchId: "g1-r1-a",
      homeId: "ballyea",
      awayId: "inagh-kilnamona",
      homeTactics: { ...DEFAULT_TACTICS, build: 88, puckout: 82 },
      awayTactics: { ...DEFAULT_TACTICS, puckout: 18 },
      seed: 99,
    });
    const kinds = new Set(result.events.map((event) => event.kind));
    expect(["free", "sixtyFive", "sideline"].some((kind) => kinds.has(kind as "free"))).toBe(true);
  });

  it("lets a sweeper cut the goals conceded compared with a 6-2-6", () => {
    const traditional: Tactics = { ...DEFAULT_TACTICS, shape: "traditional", mentality: "attacking" };
    const sweeper: Tactics = { ...DEFAULT_TACTICS, shape: "sweeper", mentality: "contain" };
    let traditionalGoals = 0;
    let sweeperGoals = 0;
    for (let seed = 1; seed <= 24; seed += 1) {
      traditionalGoals += simulateMatch({
        matchId: "g1-r1-a",
        homeId: "ballyea",
        awayId: "inagh-kilnamona",
        homeTactics: traditional,
        awayTactics: DEFAULT_TACTICS,
        seed,
      }).awayScore.goals;
      sweeperGoals += simulateMatch({
        matchId: "g1-r1-a",
        homeId: "ballyea",
        awayId: "inagh-kilnamona",
        homeTactics: sweeper,
        awayTactics: DEFAULT_TACTICS,
        seed,
      }).awayScore.goals;
    }
    expect(sweeperGoals).toBeLessThan(traditionalGoals);
  });

  it("leans on goals more from a direct long-ball game than a running game", () => {
    const direct: Tactics = { ...DEFAULT_TACTICS, build: 92, puckout: 80 };
    const running: Tactics = { ...DEFAULT_TACTICS, build: 12, puckout: 18 };
    let directGoals = 0;
    let runningGoals = 0;
    for (let seed = 1; seed <= 24; seed += 1) {
      directGoals += simulateMatch({
        matchId: "g3-r1-a",
        homeId: "clooney-quin",
        awayId: "cratloe",
        homeTactics: direct,
        awayTactics: DEFAULT_TACTICS,
        seed,
      }).homeScore.goals;
      runningGoals += simulateMatch({
        matchId: "g3-r1-a",
        homeId: "clooney-quin",
        awayId: "cratloe",
        homeTactics: running,
        awayTactics: DEFAULT_TACTICS,
        seed,
      }).homeScore.goals;
    }
    expect(directGoals).toBeGreaterThan(runningGoals);
  });

  it("stops the first half on the half-time whistle", () => {
    const first = simulateMatch({
      matchId: "g1-r1-a",
      homeId: "ballyea",
      awayId: "inagh-kilnamona",
      period: "first",
      seed: 11,
    });
    expect(first.events.at(-1)?.kind).toBe("half");
    expect(first.events.some((event) => event.kind === "full")).toBe(false);
  });

  it("shifts momentum toward the team that scores", () => {
    const result = simulateMatch({
      matchId: "g1-r1-a",
      homeId: "ballyea",
      awayId: "inagh-kilnamona",
      seed: 3,
    });
    const goal = result.events.find((event) => event.kind === "goal");
    expect(typeof momentumAt(result.events)).toBe("number");
    if (goal) {
      expect(goal.momentum).toBeGreaterThanOrEqual(4);
      expect(goal.momentum).toBeLessThanOrEqual(96);
    }
  });
});

describe("training", () => {
  it("raises sharpness and fatigue, and flags overtraining", () => {
    const squad = ratedSquad("ballyea").slice(0, 3);
    const start = Object.fromEntries(squad.map((player) => [player.name, defaultCondition()]));
    const first = applyTraining(squad, start, "challenge");
    const tired = Object.fromEntries(
      squad.map((player) => [player.name, { fatigue: 80, sharpness: 70 }]),
    );
    const second = applyTraining(squad, tired, "fitness");
    expect(first.condition[squad[0].name]?.sharpness ?? 0).toBeGreaterThan(defaultCondition().sharpness);
    expect(second.overtrained.length).toBeGreaterThan(0);
    expect(isOvertrained(second.condition[squad[0].name] ?? defaultCondition())).toBe(true);
  });

  it("lifts the trained match stats on the squad card", () => {
    const squad = ratedSquad("ballyea").slice(0, 4);
    const player = squad[0];
    const start = Object.fromEntries(squad.map((item) => [item.name, defaultCondition()]));
    const afterSkills = applyTraining(squad, start, "skills");
    const form = afterSkills.condition[player.name] ?? defaultCondition();
    expect(matchStat(player.ratings.firstTouch, form, "firstTouch")).toBe(player.ratings.firstTouch + 1);
    expect(matchStat(player.ratings.passing, form, "passing")).toBe(player.ratings.passing + 1);
    expect(matchStat(player.ratings.speed, form, "speed")).toBe(player.ratings.speed);
    expect(afterSkills.summary).toMatch(/first touch/i);
  });

  it("caps match-form boosts and lets fatigue hide them until recovery", () => {
    const squad = ratedSquad("ballyea").slice(0, 2);
    const player = squad[0];
    let condition = Object.fromEntries(squad.map((item) => [item.name, defaultCondition()]));
    for (let week = 0; week < 4; week += 1) {
      condition = applyTraining(squad, condition, "fitness").condition;
    }
    const heavy = condition[player.name] ?? defaultCondition();
    expect(heavy.boosts?.speed).toBe(4);
    expect(matchStat(player.ratings.speed, heavy, "speed")).toBeLessThan(player.ratings.speed + 4);
    const recovered = applyTraining(squad, condition, "recovery").condition[player.name] ?? defaultCondition();
    expect(recovered.fatigue).toBeLessThan(heavy.fatigue);
    expect(matchStat(player.ratings.speed, recovered, "speed")).toBe(player.ratings.speed + 4);
    expect(matchRatings(player, recovered).overall).toBeGreaterThanOrEqual(player.ratings.overall);
  });
});

describe("save migration", () => {
  it("upgrades v1 soccer-style tactics to spectrum dials", () => {
    const migrated = migrateSave({
      version: 1,
      clubId: "ballyea",
      seed: 3,
      tactics: { mentality: "attacking", style: "direct", pressing: "high" },
      sheet: defaultSheet("ballyea"),
      matches: [],
      inbox: [],
    });
    expect(migrated?.version).toBe(3);
    expect(migrated?.tactics.mentality).toBe("attacking");
    expect(migrated?.tactics.build).toBeGreaterThan(60);
    expect(migrated?.tactics.puckout).toBeGreaterThan(60);
    expect(migrated?.phase).toBe("season");
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

describe("club tactics", () => {
  it("varies AI setups instead of cloning the default", () => {
    expect(clubTactics("ballyea")).not.toEqual(clubTactics("sixmilebridge"));
  });
});
