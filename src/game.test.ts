import { describe, expect, it } from "vitest";
import { seedChampionship } from "./data/championship";
import { buildCoachReport } from "./lib/coach";
import { migrateSave } from "./lib/gameStorage";
import { seasonStatsFor } from "./lib/matchStats";
import { applyMatchMood } from "./lib/mood";
import {
  freeConversionChance,
  mistimedFoulChance,
  momentumAt,
  scoreFromEvents,
  simulateMatch,
  sixtyFiveChance,
  tackleChance,
  yellowOnFoulChance,
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

  it("lets aggressive tackling win more hooks but concede more frees and yellows", () => {
    expect(tackleChance(12, 92)).toBeGreaterThan(tackleChance(12, 12));
    expect(mistimedFoulChance(92)).toBeGreaterThan(mistimedFoulChance(12));
    expect(yellowOnFoulChance(92)).toBeGreaterThan(yellowOnFoulChance(12));

    const homeSheet = defaultSheet("ballyea");
    const homePlayers = new Set(homeSheet.starters);
    const aggressive = { ...DEFAULT_TACTICS, aggression: 94 };
    const light = { ...DEFAULT_TACTICS, aggression: 8 };
    let aggressiveHooks = 0;
    let lightHooks = 0;
    let aggressiveFrees = 0;
    let lightFrees = 0;
    let aggressiveYellows = 0;
    let lightYellows = 0;
    for (let seed = 1; seed <= 20; seed += 1) {
      const hot = simulateMatch({
        matchId: "g1-r1-a",
        homeId: "ballyea",
        awayId: "inagh-kilnamona",
        homeTactics: aggressive,
        awayTactics: light,
        seed,
      });
      const cold = simulateMatch({
        matchId: "g1-r1-a",
        homeId: "ballyea",
        awayId: "inagh-kilnamona",
        homeTactics: light,
        awayTactics: light,
        seed,
      });
      aggressiveHooks += hot.events.filter((event) => event.kind === "hook" && homePlayers.has(event.playerName)).length;
      lightHooks += cold.events.filter((event) => event.kind === "hook" && homePlayers.has(event.playerName)).length;
      aggressiveFrees += hot.events.filter((event) => event.kind === "free" && event.teamId === "inagh-kilnamona").length;
      lightFrees += cold.events.filter((event) => event.kind === "free" && event.teamId === "inagh-kilnamona").length;
      aggressiveYellows += hot.events.filter((event) => event.kind === "booking" && event.teamId === "ballyea").length;
      lightYellows += cold.events.filter((event) => event.kind === "booking" && event.teamId === "ballyea").length;
    }
    expect(aggressiveHooks).toBeGreaterThan(lightHooks);
    expect(aggressiveFrees).toBeGreaterThan(lightFrees);
    expect(aggressiveYellows).toBeGreaterThan(lightYellows);
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
    expect(afterSkills.summary).toMatch(/player profile/i);
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
    expect(migrated?.version).toBe(4);
    expect(migrated?.reports).toEqual({});
    expect(migrated?.tactics.mentality).toBe("attacking");
    expect(migrated?.tactics.build).toBeGreaterThan(60);
    expect(migrated?.tactics.puckout).toBeGreaterThan(60);
    expect(migrated?.tactics.aggression).toBeGreaterThan(30);
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

describe("match intel", () => {
  it("tracks possessions, shots and tackles for both panels", () => {
    const result = simulateMatch({
      matchId: "g1-r1-a",
      homeId: "ballyea",
      awayId: "inagh-kilnamona",
      seed: 42,
    });
    expect(result.homeStats.possessions).toBeGreaterThan(0);
    expect(result.awayStats.possessions).toBeGreaterThan(0);
    expect(result.homeStats.shots + result.awayStats.shots).toBeGreaterThan(5);
    expect(result.players.some((player) => player.minutes >= 30)).toBe(true);
    expect(result.coachReport.length).toBeGreaterThan(0);
  });

  it("flags a long-ball plan that lost the aerials", () => {
    const notes = buildCoachReport({
      clubId: "ballyea",
      homeId: "ballyea",
      awayId: "inagh-kilnamona",
      homeName: "Ballyea",
      awayName: "Inagh-Kilnamona",
      homeTactics: { ...DEFAULT_TACTICS, build: 88, puckout: 80 },
      awayTactics: DEFAULT_TACTICS,
      homeStats: {
        teamId: "ballyea",
        possessions: 20,
        passesAttempted: 40,
        passesCompleted: 22,
        shots: 8,
        scores: 2,
        highFieldingAttempted: 10,
        highFieldingWon: 2,
        puckoutsWon: 2,
        tacklesAttempted: 8,
        tacklesWon: 3,
        groundCovered: 90,
        fatigue: 40,
        overall: 13,
        rating: 6,
      },
      awayStats: {
        teamId: "inagh-kilnamona",
        possessions: 24,
        passesAttempted: 38,
        passesCompleted: 28,
        shots: 10,
        scores: 6,
        highFieldingAttempted: 10,
        highFieldingWon: 8,
        puckoutsWon: 7,
        tacklesAttempted: 6,
        tacklesWon: 4,
        groundCovered: 88,
        fatigue: 38,
        overall: 13,
        rating: 6.5,
      },
      homeScore: { goals: 0, points: 8 },
      awayScore: { goals: 1, points: 12 },
      players: [],
      events: [],
    });
    expect(notes.join(" ")).toMatch(/long ball|aerials|puck-outs/i);
  });

  it("drops mood for players left on the bench after a loss", () => {
    const squad = ratedSquad("ballyea");
    const sheet = defaultSheet("ballyea");
    const starter = squad.find((player) => sheet.starters.includes(player.name)) ?? squad[0];
    const bench = squad.find((player) => !sheet.starters.includes(player.name)) ?? squad.at(-1);
    const condition = Object.fromEntries(squad.map((player) => [player.name, defaultCondition()]));
    const next = applyMatchMood(
      condition,
      squad,
      sheet,
      sheet,
      [
        {
          name: starter.name,
          teamId: "ballyea",
          started: true,
          minutes: 62,
          possessions: 4,
          passesAttempted: 6,
          passesCompleted: 4,
          shots: 3,
          scores: 2,
          highFieldingAttempted: 1,
          highFieldingWon: 1,
          puckoutsWon: 0,
          tacklesAttempted: 2,
          tacklesWon: 1,
          groundCovered: 8,
          fatigue: 40,
          overall: 16,
          rating: 8.2,
          mood: 58,
        },
      ],
      "loss",
    );
    expect(bench).toBeTruthy();
    expect(next[bench!.name]?.mood ?? 58).toBeLessThan(defaultCondition().mood ?? 58);
    expect(next[starter.name]?.mood ?? 58).toBeLessThan(70);
  });

  it("rolls season totals from stored match reports", () => {
    const rolled = seasonStatsFor(
      {
        a: {
          matchId: "a",
          homeId: "ballyea",
          awayId: "feakle",
          homeScore: { goals: 1, points: 12 },
          awayScore: { goals: 0, points: 10 },
          homeTactics: DEFAULT_TACTICS,
          awayTactics: DEFAULT_TACTICS,
          homeSheet: defaultSheet("ballyea"),
          awaySheet: defaultSheet("feakle"),
          homeStats: {
            teamId: "ballyea",
            possessions: 1,
            passesAttempted: 1,
            passesCompleted: 1,
            shots: 1,
            scores: 1,
            highFieldingAttempted: 1,
            highFieldingWon: 1,
            puckoutsWon: 1,
            tacklesAttempted: 1,
            tacklesWon: 1,
            groundCovered: 1,
            fatigue: 20,
            overall: 15,
            rating: 7,
          },
          awayStats: {
            teamId: "feakle",
            possessions: 0,
            passesAttempted: 0,
            passesCompleted: 0,
            shots: 0,
            scores: 0,
            highFieldingAttempted: 0,
            highFieldingWon: 0,
            puckoutsWon: 0,
            tacklesAttempted: 0,
            tacklesWon: 0,
            groundCovered: 0,
            fatigue: 0,
            overall: 0,
            rating: 0,
          },
          players: [
            {
              name: "Tony Kelly",
              teamId: "ballyea",
              started: true,
              minutes: 62,
              possessions: 8,
              passesAttempted: 10,
              passesCompleted: 7,
              shots: 4,
              scores: 3,
              highFieldingAttempted: 2,
              highFieldingWon: 1,
              puckoutsWon: 0,
              tacklesAttempted: 1,
              tacklesWon: 1,
              groundCovered: 9.2,
              fatigue: 40,
              overall: 19,
              rating: 8.4,
              mood: 70,
            },
          ],
          coachReport: [],
        },
      },
      "ballyea",
      "Tony Kelly",
    );
    expect(rolled.minutes).toBe(62);
    expect(rolled.scores).toBe(3);
    expect(rolled.rating).toBe(8.4);
  });
});
