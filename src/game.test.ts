import { describe, expect, it } from "vitest";
import { seedChampionship } from "./data/championship";
import { ageResponse, GRADE_LABEL, profileFor } from "./data/playerProfiles";
import { buildCoachReport } from "./lib/coach";
import { applyMatchForm, formValue } from "./lib/form";
import { migrateSave } from "./lib/gameStorage";
import { seasonStatsFor, lastMatchRating } from "./lib/matchStats";
import { openPlayConversion } from "./lib/shooting";
import { crossWind, parallelWind, passCompleteChance, rollClimate, withWindFor } from "./lib/weather";
import {
  commentaryFeed,
  freeConversionChance,
  mistimedFoulChance,
  momentumAt,
  scoreFromEvents,
  redOnFoulChance,
  reshapeTo625,
  sentOffNamesFromEvents,
  simulateMatch,
  sixtyFiveChance,
  tackleChance,
  yellowOnFoulChance,
} from "./lib/matchEngine";
import { clubTactics, DEFAULT_TACTICS, defaultSheet, matchOrderIndex, matchShirtNumber, matchSlot, playerAge, ratePlayer, ratedSquad, sideStrength } from "./lib/players";
import { nextBatch } from "./lib/schedule";
import { matchPlayed } from "./lib/scoring";
import { ATTRIBUTE_KEYS } from "./lib/attributes";
import { applyMatchFatigue, applyTeamwork, applyTraining, applyWeekSession, averageMatchOverall, bankedLift, boostTotal, defaultCondition, fitnessOf, formatBoostDelta, isOvertrained, matchStat, sessionForSlot, tableLift, trainedStat, trainingDelta, weekCoachCopy } from "./lib/training";
import { buildPreMatchBriefing } from "./lib/briefing";
import type { Tactics } from "./types";
import { nextSwapPick } from "./components/SwapConfirmBar";

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
    expect(kelly?.ratings.shooting).toBeGreaterThanOrEqual(16);
    expect(kelly?.ratings.teamwork).toBeGreaterThanOrEqual(12);
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

  it("lets a modest overall hide a standout attribute", () => {
    const panel = seedChampionship.teams.flatMap((team) => ratedSquad(team.id));
    const outlier = panel.find((player) => {
      const peak = Math.max(...ATTRIBUTE_KEYS.map((key) => player.ratings[key]));
      return player.ratings.overall <= 12 && peak - player.ratings.overall >= 7;
    });
    expect(outlier).toBeTruthy();
    expect(panel.some((player) => player.ratings.overall <= 9)).toBe(true);
  });

  it("grades current Clare seniors above former county and underage players", () => {
    const kelly = ratedSquad("ballyea").find((player) => player.name === "Tony Kelly");
    const duggan = ratedSquad("clooney-quin").find((player) => player.name === "Peter Duggan");
    const morey = ratedSquad("sixmilebridge").find((player) => player.name === "Seadna Morey");
    const costelloe = ratedSquad("ballyea").find((player) => player.name === "Daniel Costelloe");
    const coote = ratedSquad("ballyea").find((player) => player.name === "Barry Coote");
    expect(kelly?.grade).toBe("A");
    expect(kelly?.age).toBe(32);
    expect(kelly?.ratings.overall).toBeGreaterThanOrEqual(19);
    expect(duggan?.grade).toBe("A");
    expect(duggan?.ratings.overall).toBeGreaterThanOrEqual(17);
    expect(morey?.grade).toBe("B");
    expect(morey?.ratings.overall).toBeGreaterThanOrEqual(12);
    expect(morey?.ratings.overall).toBeLessThanOrEqual(16);
    expect(costelloe?.grade).toBe("C");
    expect(costelloe?.ratings.overall).toBeGreaterThanOrEqual(10);
    expect(costelloe?.ratings.overall).toBeLessThanOrEqual(15);
    expect(coote?.grade).toBe("D");
    expect(coote?.ratings.overall).toBeLessThanOrEqual(12);
    expect(GRADE_LABEL.A).toMatch(/Clare senior/);
  });

  it("keeps grade bands across the championship panels", () => {
    const panel = seedChampionship.teams.flatMap((team) => ratedSquad(team.id));
    const band: Record<string, [number, number]> = { A: [15, 20], B: [12, 16], C: [10, 15], D: [5, 12] };
    for (const player of panel) {
      const [min, max] = band[player.grade] ?? [1, 20];
      expect(player.ratings.overall).toBeGreaterThanOrEqual(min);
      expect(player.ratings.overall).toBeLessThanOrEqual(max);
      expect(player.age).toBeGreaterThanOrEqual(18);
      expect(player.age).toBeLessThanOrEqual(40);
    }
    expect(panel.some((player) => player.grade === "A")).toBe(true);
    expect(panel.some((player) => player.grade === "D" && player.ratings.overall <= 9)).toBe(true);
  });

  it("treats younger players as quicker to recover", () => {
    expect(ageResponse(20).recover).toBeGreaterThan(ageResponse(33).recover);
    expect(ageResponse(20).fatigue).toBeLessThan(ageResponse(37).fatigue);
    expect(ageResponse(20).train).toBeGreaterThan(ageResponse(37).train);
    expect(playerAge("sixmilebridge", "Mark Sheedy")).toBeLessThan(playerAge("clonlara", "John Conlon"));
    expect(profileFor("clooney-quin", "Peter Duggan").grade).toBe("A");
  });

  it("rolls a fresh attribute set per career seed while staying inside the grade band", () => {
    const first = ratePlayer("ballyea", "Tony Kelly", 7, 101);
    const second = ratePlayer("ballyea", "Tony Kelly", 7, 202);
    expect(first.overall).toBeGreaterThanOrEqual(19);
    expect(second.overall).toBeGreaterThanOrEqual(19);
    expect(first.frees).toBeGreaterThanOrEqual(17);
    expect(second.frees).toBeGreaterThanOrEqual(17);
    expect(ATTRIBUTE_KEYS.some((key) => first[key] !== second[key])).toBe(true);

    const hassettA = ratePlayer("clooney-quin", "Callum Hassett", 13, 11);
    const hassettB = ratePlayer("clooney-quin", "Callum Hassett", 13, 99);
    expect(hassettA.overall).toBeGreaterThanOrEqual(10);
    expect(hassettA.overall).toBeLessThanOrEqual(15);
    expect(hassettB.overall).toBeGreaterThanOrEqual(10);
    expect(hassettB.overall).toBeLessThanOrEqual(15);
    expect(ATTRIBUTE_KEYS.some((key) => hassettA[key] !== hassettB[key])).toBe(true);
  });

  it("marks Clare underage history and natural lines from 2025/2026 panels", () => {
    const clooney = ratedSquad("clooney-quin");
    const hassett = clooney.find((player) => player.name === "Callum Hassett");
    const scanlan = clooney.find((player) => player.name === "Sam Scanlan");
    const duggan = clooney.find((player) => player.name === "Cillian Duggan");
    const corry = clooney.find((player) => player.name === "Jimmy Corry");
    expect(hassett?.grade).toBe("C");
    expect(hassett?.position).toBe("FF");
    expect(scanlan?.grade).toBe("C");
    expect(scanlan?.position).toBe("FF");
    expect(duggan?.position).toBe("GK");
    expect(corry?.position).toBe("MF");
    expect(profileFor("ballyea", "Peter Casey").grade).toBe("C");
    expect(profileFor("clooney-quin", "John Conneally").grade).toBe("B");
    expect(profileFor("inagh-kilnamona", "Conner Hegarty").grade).toBe("C");
  });

  it("gives every club a wider 2025/2026 championship panel", () => {
    for (const team of seedChampionship.teams) {
      expect(ratedSquad(team.id).length, team.name).toBeGreaterThanOrEqual(20);
    }
    const names = ratedSquad("clooney-quin").map((player) => player.name);
    expect(names).toContain("Cillian Duggan");
    expect(names).toContain("Jimmy Corry");
    expect(names).toContain("Trevor Lee");
  });
});

describe("club colours", () => {
  it("gives Clooney-Quin red and green and the rest their traditional colours", () => {
    const byId = Object.fromEntries(seedChampionship.teams.map((team) => [team.id, team]));
    expect(byId["clooney-quin"]?.colours.label.toLowerCase()).toContain("red");
    expect(byId["clooney-quin"]?.colours.label.toLowerCase()).toContain("green");
    expect(byId["clooney-quin"]?.colours.primary).toBe("#c41e3a");
    expect(byId["clooney-quin"]?.colours.secondary).toBe("#2f9d4a");
    expect(byId.ballyea?.colours.label).toMatch(/black/i);
    expect(byId["eire-og"]?.colours.label).toMatch(/red/i);
    expect(byId.clonlara?.colours.label).toMatch(/gold/i);
    expect(byId.cratloe?.colours.label).toMatch(/blue/i);
    expect(byId.sixmilebridge?.colours.label).toMatch(/saffron/i);
    expect(byId["st-josephs"]?.colours.label).toMatch(/maroon/i);
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
    expect(stars.attack + stars.defence).toBeGreaterThan(weaker.attack + weaker.defence - 2.5);
  });

  it("makes specialist free-takers convert far more dead balls", () => {
    expect(freeConversionChance(19, 18, 18)).toBeGreaterThan(freeConversionChance(10, 11, 11) + 0.2);
    expect(sixtyFiveChance(18, 18, 16)).toBeGreaterThan(sixtyFiveChance(9, 10, 10));
  });

  it("produces set-piece and puck-out events", () => {
    const kinds = new Set<string>();
    for (let seed = 99; seed <= 108 && !["free", "sixtyFive", "sideline"].some((kind) => kinds.has(kind)); seed += 1) {
      const result = simulateMatch({
        matchId: "g1-r1-a",
        homeId: "ballyea",
        awayId: "inagh-kilnamona",
        homeTactics: { ...DEFAULT_TACTICS, build: 88, puckout: 82, aggression: 88 },
        awayTactics: { ...DEFAULT_TACTICS, puckout: 18, aggression: 80 },
        seed,
      });
      for (const event of result.events) kinds.add(event.kind);
    }
    expect(["free", "sixtyFive", "sideline"].some((kind) => kinds.has(kind))).toBe(true);
    expect(kinds.has("puckout")).toBe(true);
  });

  it("lets a sweeper cut the goals conceded compared with a 6-2-6", () => {
    const traditional: Tactics = { ...DEFAULT_TACTICS, shape: "traditional", mentality: "attacking" };
    const sweeper: Tactics = { ...DEFAULT_TACTICS, shape: "sweeper", mentality: "contain" };
    let traditionalGoals = 0;
    let sweeperGoals = 0;
    for (let seed = 1; seed <= 48; seed += 1) {
      traditionalGoals += simulateMatch({
        matchId: "g1-r1-a",
        homeId: "ballyea",
        awayId: "inagh-kilnamona",
        homeTactics: traditional,
        awayTactics: DEFAULT_TACTICS,
        climate: { sky: "sunny", windStrength: 8, windAngle: 12 },
        seed,
      }).awayScore.goals;
      sweeperGoals += simulateMatch({
        matchId: "g1-r1-a",
        homeId: "ballyea",
        awayId: "inagh-kilnamona",
        homeTactics: sweeper,
        awayTactics: DEFAULT_TACTICS,
        climate: { sky: "sunny", windStrength: 8, windAngle: 12 },
        seed,
      }).awayScore.goals;
    }
    expect(sweeperGoals).toBeLessThan(traditionalGoals);
  });

  it("takes a sent-off player off the field and plays 6-2-5", () => {
    const sheet = defaultSheet("ballyea");
    const sent = sheet.starters[4]!;
    const result = simulateMatch({
      matchId: "g1-r1-a",
      homeId: "ballyea",
      awayId: "inagh-kilnamona",
      homeTactics: { ...DEFAULT_TACTICS, shape: "sweeper" },
      climate: { sky: "sunny", windStrength: 8, windAngle: 12 },
      seed: 4,
      forcedRemovals: [{ minute: 10, teamId: "ballyea", name: sent, kind: "red" }],
    });
    expect(result.events.some((event) => event.kind === "red" && event.playerName === sent)).toBe(true);
    const after = result.events.filter((event) => event.minute > 10);
    expect(after.some((event) => event.playerName === sent && event.kind !== "red")).toBe(false);
    expect(sentOffNamesFromEvents(result.events, "ballyea")).toContain(sent);
    const field = reshapeTo625(sheet.starters, [sent]);
    expect(field).toHaveLength(14);
    expect(field).not.toContain(sent);
    const minutes = result.players.find((row) => row.name === sent && row.teamId === "ballyea")?.minutes ?? 62;
    expect(minutes).toBeLessThan(50);
  });

  it("replaces an injured starter immediately and stops his minutes", () => {
    const sheet = defaultSheet("ballyea");
    const hurt = sheet.starters[11]!;
    const result = simulateMatch({
      matchId: "g1-r1-a",
      homeId: "ballyea",
      awayId: "inagh-kilnamona",
      seed: 5,
      forcedRemovals: [{ minute: 12, teamId: "ballyea", name: hurt, kind: "injury" }],
    });
    expect(result.events.some((event) => event.kind === "injury" && event.playerName === hurt)).toBe(true);
    expect(result.events.some((event) => event.kind === "sub" && event.text.includes(hurt))).toBe(true);
    const after = result.events.filter((event) => event.minute > 12);
    expect(after.some((event) => event.playerName === hurt && event.kind !== "injury")).toBe(false);
    const minutes = result.players.find((row) => row.name === hurt && row.teamId === "ballyea")?.minutes ?? 62;
    expect(minutes).toBeLessThan(40);
  });

  it("books low-composure players more readily, and wet weather adds a few more cards", () => {
    expect(yellowOnFoulChance(70, 6)).toBeGreaterThan(yellowOnFoulChance(70, 18));
    expect(redOnFoulChance(70, 6)).toBeGreaterThan(redOnFoulChance(70, 18));
    expect(mistimedFoulChance(70, true)).toBeGreaterThan(mistimedFoulChance(70, false));
    expect(yellowOnFoulChance(70, 12, true)).toBeGreaterThan(yellowOnFoulChance(70, 12, false));
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
        climate: { sky: "sunny", windStrength: 8, windAngle: 12 },
        seed,
      }).homeScore.goals;
      runningGoals += simulateMatch({
        matchId: "g3-r1-a",
        homeId: "clooney-quin",
        awayId: "cratloe",
        homeTactics: running,
        awayTactics: DEFAULT_TACTICS,
        climate: { sky: "sunny", windStrength: 8, windAngle: 12 },
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
    for (let seed = 1; seed <= 28; seed += 1) {
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
      aggressiveYellows += hot.events.filter(
        (event) => (event.kind === "booking" || event.kind === "red") && event.teamId === "ballyea",
      ).length;
      lightYellows += cold.events.filter(
        (event) => (event.kind === "booking" || event.kind === "red") && event.teamId === "ballyea",
      ).length;
    }
    expect(aggressiveHooks).toBeGreaterThan(lightHooks);
    expect(aggressiveFrees + aggressiveYellows).toBeGreaterThan(lightFrees + lightYellows);
    expect(aggressiveYellows).toBeGreaterThan(lightYellows);
  });

  it("turns pressure into more successful tackles", () => {
    expect(tackleChance(12, 46, 92)).toBeGreaterThan(tackleChance(12, 46, 12));
    const homeSheet = defaultSheet("ballyea");
    const homePlayers = new Set(homeSheet.starters);
    const press = { ...DEFAULT_TACTICS, pressure: 94, aggression: 40 };
    const sit = { ...DEFAULT_TACTICS, pressure: 8, aggression: 40 };
    let pressHooks = 0;
    let sitHooks = 0;
    for (let seed = 1; seed <= 16; seed += 1) {
      const hot = simulateMatch({
        matchId: "g1-r1-a",
        homeId: "ballyea",
        awayId: "inagh-kilnamona",
        homeTactics: press,
        awayTactics: sit,
        climate: { sky: "sunny", windStrength: 8, windAngle: 12 },
        seed,
      });
      const cold = simulateMatch({
        matchId: "g1-r1-a",
        homeId: "ballyea",
        awayId: "inagh-kilnamona",
        homeTactics: sit,
        awayTactics: sit,
        climate: { sky: "sunny", windStrength: 8, windAngle: 12 },
        seed,
      });
      pressHooks += hot.events.filter((event) => event.kind === "hook" && homePlayers.has(event.playerName)).length;
      sitHooks += cold.events.filter((event) => event.kind === "hook" && homePlayers.has(event.playerName)).length;
    }
    expect(pressHooks).toBeGreaterThan(sitHooks);
  });

  it("lets strength win more tackles than a lighter panel", () => {
    expect(tackleChance(12, 46, 48, 18)).toBeGreaterThan(tackleChance(12, 46, 48, 8));
  });

  it("uses the named long-free, short-free and sideline takers", () => {
    const sheet = defaultSheet("ballyea");
    const longName = sheet.starters[12] ?? sheet.starters[11];
    const shortName = sheet.starters[13] ?? sheet.starters[10];
    const sidelineName = sheet.starters[6] ?? sheet.starters[5];
    const homeSet: { playerName: string }[] = [];
    for (let seed = 1; seed <= 48 && homeSet.length === 0; seed += 1) {
      const result = simulateMatch({
        matchId: "g1-r1-a",
        homeId: "ballyea",
        awayId: "inagh-kilnamona",
        homeTactics: {
          ...DEFAULT_TACTICS,
          build: 90,
          longFreeTaker: longName,
          shortFreeTaker: shortName,
          sidelineTaker: sidelineName,
        },
        seed,
      });
      homeSet.push(
        ...result.events.filter(
          (event) => event.teamId === "ballyea" && ["free", "sixtyFive", "sideline"].includes(event.kind),
        ),
      );
    }
    expect(homeSet.length).toBeGreaterThan(0);
    const names = new Set(homeSet.map((event) => event.playerName));
    expect([...names].every((name) => name === longName || name === shortName || name === sidelineName)).toBe(true);
  });

  it("awards 65s after a save or a tackle over the end line", () => {
    const sixtyFives: { prior: string[] }[] = [];
    for (let seed = 1; seed <= 36; seed += 1) {
      const result = simulateMatch({
        matchId: "g1-r1-a",
        homeId: "ballyea",
        awayId: "inagh-kilnamona",
        climate: { sky: "sunny", windStrength: 8, windAngle: 12 },
        seed,
      });
      result.events.forEach((event, index) => {
        if (event.kind !== "sixtyFive") return;
        const prior = result.events.slice(Math.max(0, index - 3), index).map((item) => item.kind);
        sixtyFives.push({ prior });
      });
    }
    expect(sixtyFives.length).toBeGreaterThan(0);
    expect(sixtyFives.every((row) => row.prior.includes("save") || row.prior.includes("hook"))).toBe(true);
  });

  it("does not let the designated free-taker hog open-play shots", () => {
    const sheet = defaultSheet("ballyea");
    const taker = sheet.starters[2] ?? sheet.starters[1];
    let openPlay = 0;
    let openPlayByTaker = 0;
    let setPieces = 0;
    let setPiecesByTaker = 0;
    for (let seed = 1; seed <= 24; seed += 1) {
      const result = simulateMatch({
        matchId: "g1-r1-a",
        homeId: "ballyea",
        awayId: "inagh-kilnamona",
        homeTactics: {
          ...DEFAULT_TACTICS,
          longFreeTaker: taker,
          shortFreeTaker: taker,
          sidelineTaker: taker,
        },
        climate: { sky: "sunny", windStrength: 8, windAngle: 12 },
        seed,
      });
      for (const event of result.events) {
        if (event.teamId !== "ballyea") continue;
        if (event.kind === "point" || event.kind === "goal") {
          openPlay += 1;
          if (event.playerName === taker) openPlayByTaker += 1;
        } else if (event.kind === "wide" && !/free|65|sideline/i.test(event.text)) {
          openPlay += 1;
          if (event.playerName === taker) openPlayByTaker += 1;
        }
        if (event.kind === "free" || event.kind === "sixtyFive" || event.kind === "sideline") {
          setPieces += 1;
          if (event.playerName === taker) setPiecesByTaker += 1;
        }
      }
    }
    expect(openPlay).toBeGreaterThan(10);
    expect(openPlayByTaker).toBe(0);
    expect(setPieces).toBeGreaterThan(0);
    expect(setPiecesByTaker).toBe(setPieces);
  });

  it("plays at championship tempo: tackles, possessions and scoring", () => {
    const samples = [3, 11, 19, 27, 42, 55, 63, 77, 88, 99].map((seed) =>
      simulateMatch({
        matchId: "g1-r1-a",
        homeId: "ballyea",
        awayId: "inagh-kilnamona",
        climate: { sky: "sunny", windStrength: 10, windAngle: 15 },
        seed,
      }),
    );
    const avg = (pick: (row: (typeof samples)[number]) => number) =>
      samples.reduce((sum, row) => sum + pick(row), 0) / samples.length;
    expect(avg((row) => row.homeStats.tacklesAttempted + row.awayStats.tacklesAttempted)).toBeGreaterThan(70);
    expect(avg((row) => row.homeStats.possessions + row.awayStats.possessions)).toBeGreaterThan(80);
    expect(avg((row) => row.homeStats.possessions + row.awayStats.possessions)).toBeLessThan(170);
    expect(avg((row) => row.homeScore.points)).toBeGreaterThan(10);
    expect(avg((row) => row.awayScore.points)).toBeGreaterThan(10);
    expect(avg((row) => row.homeScore.points)).toBeLessThan(32);
    expect(avg((row) => row.awayScore.points)).toBeLessThan(32);
    expect(avg((row) => row.homeScore.goals + row.awayScore.goals)).toBeGreaterThanOrEqual(0.5);
    expect(samples.every((row) => row.events.filter((event) => event.kind === "hook").length >= 55)).toBe(true);
    const conversion = avg((row) =>
      row.homeStats.shots + row.awayStats.shots > 0
        ? (row.homeStats.scores + row.awayStats.scores) / (row.homeStats.shots + row.awayStats.shots)
        : 0,
    );
    expect(conversion).toBeGreaterThan(0.48);
    expect(conversion).toBeLessThan(0.78);
  });

  it("keeps scores and cards in the live commentary mix", () => {
    const result = simulateMatch({
      matchId: "g1-r1-a",
      homeId: "ballyea",
      awayId: "inagh-kilnamona",
      seed: 42,
    });
    const feed = commentaryFeed(result.events.filter((event) => event.kind !== "full"));
    expect(feed.some((event) => event.kind === "goal" || event.kind === "point" || event.kind === "free")).toBe(true);
    expect(feed.filter((event) => event.kind === "hook").length).toBeLessThanOrEqual(6);
  });

  it("converts about 60 percent for a medium shooter with a balanced brief", () => {
    const balanced = openPlayConversion({
      strikingDistance: 12,
      composure: 12,
      shooting: 50,
      distanceM: 45,
      withWind: 0,
      crossWind: 0,
      wet: false,
    });
    const speculative = openPlayConversion({
      strikingDistance: 12,
      composure: 12,
      shooting: 8,
      distanceM: 62,
      withWind: 0,
      crossWind: 0,
      wet: false,
    });
    const certain = openPlayConversion({
      strikingDistance: 12,
      composure: 12,
      shooting: 92,
      distanceM: 32,
      withWind: 0,
      crossWind: 0,
      wet: false,
    });
    expect(balanced).toBeGreaterThan(0.57);
    expect(balanced).toBeLessThan(0.63);
    expect(speculative).toBeLessThan(balanced - 0.08);
    expect(certain).toBeGreaterThan(balanced + 0.08);
  });

  it("converts more when the shooter has a finishing attribute", () => {
    const base = {
      strikingDistance: 12,
      composure: 12,
      shooting: 50,
      distanceM: 45,
      withWind: 0,
      crossWind: 0,
      wet: false,
    };
    expect(openPlayConversion({ ...base, finishing: 18 })).toBeGreaterThan(openPlayConversion({ ...base, finishing: 8 }));
  });

  it("lets a shoot-on-sight side take more shots than a certain side", () => {
    const calm = { sky: "sunny" as const, windStrength: 8, windAngle: 10 };
    let speculativeShots = 0;
    let certainShots = 0;
    for (let seed = 1; seed <= 12; seed += 1) {
      speculativeShots += simulateMatch({
        matchId: "g1-r1-a",
        homeId: "ballyea",
        awayId: "inagh-kilnamona",
        homeTactics: { ...DEFAULT_TACTICS, shooting: 8 },
        climate: calm,
        seed,
      }).homeStats.shots;
      certainShots += simulateMatch({
        matchId: "g1-r1-a",
        homeId: "ballyea",
        awayId: "inagh-kilnamona",
        homeTactics: { ...DEFAULT_TACTICS, shooting: 92 },
        climate: calm,
        seed,
      }).homeStats.shots;
    }
    expect(speculativeShots).toBeGreaterThan(certainShots);
  });

  it("records a shot map and keeps climate the same both halves", () => {
    const first = simulateMatch({
      matchId: "g1-r1-a",
      homeId: "ballyea",
      awayId: "inagh-kilnamona",
      period: "first",
      seed: 21,
    });
    const second = simulateMatch({
      matchId: "g1-r1-a",
      homeId: "ballyea",
      awayId: "inagh-kilnamona",
      period: "second",
      climate: first.climate,
      startHome: first.homeScore,
      startAway: first.awayScore,
      seed: 21,
    });
    expect(first.shots.length).toBeGreaterThan(4);
    expect(second.shots.length).toBeGreaterThan(4);
    expect(first.climate).toEqual(second.climate);
    expect(first.shots.every((shot) => shot.x > 0 && shot.x < 90 && shot.y > 0 && shot.y < 145)).toBe(true);
  });
});

describe("weather", () => {
  it("rolls a stable forecast for a fixture", () => {
    expect(rollClimate(9, "g1-r1-a")).toEqual(rollClimate(9, "g1-r1-a"));
    expect(rollClimate(9, "g1-r1-a")).not.toEqual(rollClimate(9, "g2-r1-a"));
  });

  it("flips a parallel wind between halves", () => {
    const climate = { sky: "windy" as const, windStrength: 80, windAngle: 0 };
    expect(parallelWind(climate)).toBeGreaterThan(0.7);
    expect(crossWind(climate)).toBeLessThan(0.1);
    expect(withWindFor(climate, "ballyea", "ballyea", "first")).toBeGreaterThan(0.7);
    expect(withWindFor(climate, "ballyea", "ballyea", "second")).toBeLessThan(-0.7);
    expect(withWindFor(climate, "inagh-kilnamona", "ballyea", "first")).toBeLessThan(-0.7);
  });

  it("makes short passing harder in the wet", () => {
    const dry = { sky: "sunny" as const, windStrength: 10, windAngle: 20 };
    const wet = { sky: "wet" as const, windStrength: 10, windAngle: 20 };
    expect(passCompleteChance(wet, 0.2)).toBeLessThan(passCompleteChance(dry, 0.2) - 0.1);
  });
});

describe("training", () => {
  const physicalPlan = {
    mix: { defensive: 0, attacking: 0, tactics: 0, physical: 100, setpieces: 0 },
    recovery: false,
  };
  const tacticsPlan = {
    mix: { defensive: 0, attacking: 0, tactics: 100, physical: 0, setpieces: 0 },
    recovery: false,
  };

  it("raises sharpness and fatigue, and flags overtraining", () => {
    const squad = ratedSquad("ballyea").slice(0, 3);
    const start = Object.fromEntries(squad.map((player) => [player.name, defaultCondition()]));
    const plans = Object.fromEntries(squad.map((player) => [player.name, physicalPlan]));
    const first = applyTraining(squad, start, "challenge", {}, defaultSheet("ballyea"));
    const tired = Object.fromEntries(
      squad.map((player) => [player.name, { fatigue: 80, sharpness: 70 }]),
    );
    const second = applyTraining(squad, tired, "mixed", plans);
    expect(first.condition[squad[0].name]?.sharpness ?? 0).toBeGreaterThan(defaultCondition().sharpness);
    expect(second.overtrained.length).toBeGreaterThan(0);
    expect(isOvertrained(second.condition[squad[0].name] ?? defaultCondition())).toBe(true);
  });

  it("shows banked training without counting sharpness or tired legs", () => {
    const squad = ratedSquad("ballyea").slice(0, 1);
    const player = squad[0]!;
    const fresh = { ...defaultCondition(), sharpness: 90, boosts: { speed: 0.6, passing: -0.2 } };
    const tired = { ...fresh, fatigue: 80 };
    expect(trainingDelta(fresh, "speed")).toBe(1);
    expect(trainingDelta(fresh, "passing")).toBe(0);
    expect(trainedStat(player.ratings.speed, fresh, "speed")).toBe(player.ratings.speed + 1);
    expect(trainedStat(player.ratings.speed, tired, "speed")).toBe(player.ratings.speed + 1);
    expect(matchStat(player.ratings.speed, tired, "speed")).toBeLessThan(trainedStat(player.ratings.speed, tired, "speed"));
  });

  it("banks small decimal lifts that do not always show on the card", () => {
    const squad = ratedSquad("ballyea").slice(0, 4);
    const player = squad[0];
    const start = Object.fromEntries(squad.map((item) => [item.name, defaultCondition()]));
    const afterSkills = applyTraining(squad, start, "mixed", { [player.name]: tacticsPlan });
    const form = afterSkills.condition[player.name] ?? defaultCondition();
    expect(form.boosts?.passing ?? 0).toBeGreaterThan(0);
    expect(form.boosts?.passing ?? 0).toBeLessThan(1);
    expect(form.boosts?.firstTouch ?? 0).toBeGreaterThan(0);
    expect(form.boosts?.speed ?? 0).toBeLessThan(0);
    expect(matchStat(player.ratings.passing, form, "passing")).toBe(player.ratings.passing);
    expect(matchStat(player.ratings.workrate, form, "workrate")).toBe(player.ratings.workrate);
    expect(matchStat(player.ratings.composure, form, "composure")).toBe(player.ratings.composure);
    expect(afterSkills.summary).toMatch(/first touch/i);
    expect(afterSkills.summary).toMatch(/player profile/i);
  });

  it("formats small banked lifts for the training table instead of hiding them", () => {
    expect(formatBoostDelta(0)).toBe("");
    expect(formatBoostDelta(0.057)).toBe("+0.06");
    expect(formatBoostDelta(0.147)).toBe("+0.15");
    expect(formatBoostDelta(-0.12)).toBe("-0.12");
    expect(formatBoostDelta(1)).toBe("+1");
    expect(formatBoostDelta(1.2)).toBe("+1.2");
    expect(tableLift(0.06, 0)).toBe(0.06);
    expect(tableLift(0, 0.04)).toBe(0.04);
    const squad = ratedSquad("ballyea").slice(0, 1);
    const player = squad[0]!;
    const start = { [player.name]: defaultCondition() };
    const after = applyTraining(squad, start, "mixed", { [player.name]: tacticsPlan });
    const form = after.condition[player.name] ?? defaultCondition();
    expect(formatBoostDelta(bankedLift(form, "passing"))).not.toBe("");
    expect(formatBoostDelta(after.deltas[player.name]?.passing ?? 0)).not.toBe("");
    expect(Math.round(after.deltas[player.name]?.passing ?? 0)).toBe(0);
  });

  it("uses mixed sessions for a three-session week and a challenge only on the third slot of a challenge week", () => {
    expect(sessionForSlot("preseason", "triple", 0)).toBe("mixed");
    expect(sessionForSlot("preseason", "triple", 2)).toBe("mixed");
    expect(sessionForSlot("preseason", "challenge", 1)).toBe("mixed");
    expect(sessionForSlot("preseason", "challenge", 2)).toBe("challenge");
    expect(sessionForSlot("season", "challenge", 0, "mixed")).toBe("mixed");
  });

  it("does not let training move mental attributes", () => {
    const squad = ratedSquad("ballyea").slice(0, 3);
    const player = squad[0]!;
    const start = Object.fromEntries(squad.map((item) => [item.name, defaultCondition()]));
    const after = applyTraining(squad, start, "challenge", {}, defaultSheet("ballyea"));
    const form = after.condition[player.name] ?? defaultCondition();
    expect(form.boosts?.workrate ?? 0).toBe(0);
    expect(form.boosts?.composure ?? 0).toBe(0);
    expect(form.boosts?.underPressure ?? 0).toBe(0);
  });

  it("caps match-form boosts at +2 and lets fatigue hide them until recovery", () => {
    const squad = ratedSquad("ballyea").slice(0, 2);
    const player = squad[0];
    const plans = Object.fromEntries(squad.map((item) => [item.name, physicalPlan]));
    let condition = Object.fromEntries(squad.map((item) => [item.name, defaultCondition()]));
    for (let session = 0; session < 24; session += 1) {
      condition = applyTraining(squad, condition, "mixed", plans, undefined, undefined, "intense").condition;
    }
    const heavy = condition[player.name] ?? defaultCondition();
    expect(heavy.boosts?.speed ?? 0).toBeLessThanOrEqual(2);
    expect(heavy.boosts?.speed ?? 0).toBeGreaterThan(1);
    expect(heavy.boosts?.passing ?? 0).toBeLessThan(0);
    expect(heavy.boosts?.passing ?? 0).toBeGreaterThanOrEqual(-1);
    expect(matchStat(player.ratings.speed, heavy, "speed")).toBeLessThan(
      player.ratings.speed + Math.round(heavy.boosts?.speed ?? 0),
    );
    let recoveredMap = condition;
    for (let rest = 0; rest < 4; rest += 1) {
      recoveredMap = applyTraining(squad, recoveredMap, "recovery").condition;
    }
    const recovered = recoveredMap[player.name] ?? defaultCondition();
    expect(recovered.fatigue).toBeLessThan(heavy.fatigue);
    expect(recovered.boosts?.speed).toBe(heavy.boosts?.speed);
    expect(matchStat(player.ratings.speed, recovered, "speed")).toBeGreaterThan(
      matchStat(player.ratings.speed, heavy, "speed"),
    );
  });

  it("keeps a preseason specialist block to a modest net lift", () => {
    const squad = ratedSquad("ballyea").slice(0, 2);
    const player = squad[0]!;
    const plans = Object.fromEntries(squad.map((item) => [item.name, physicalPlan]));
    let condition = Object.fromEntries(squad.map((item) => [item.name, defaultCondition()]));
    for (let session = 0; session < 12; session += 1) {
      condition = applyTraining(squad, condition, "mixed", plans).condition;
    }
    const form = condition[player.name] ?? defaultCondition();
    expect(form.boosts?.speed ?? 0).toBeGreaterThan(0.6);
    expect(form.boosts?.speed ?? 0).toBeLessThanOrEqual(2);
    expect(form.boosts?.passing ?? 0).toBeLessThan(0);
    expect(boostTotal(form)).toBeGreaterThan(0);
    expect(boostTotal(form)).toBeLessThan(4);
  });

  it("lets a young player shake off a session faster than a veteran", () => {
    const sheedy = ratedSquad("sixmilebridge").find((player) => player.name === "Mark Sheedy");
    const conlon = ratedSquad("clonlara").find((player) => player.name === "John Conlon");
    expect(sheedy && conlon).toBeTruthy();
    const start = {
      [sheedy!.name]: defaultCondition(),
      [conlon!.name]: defaultCondition(),
    };
    const plans = {
      [sheedy!.name]: physicalPlan,
      [conlon!.name]: physicalPlan,
    };
    const after = applyTraining([sheedy!, conlon!], start, "mixed", plans).condition;
    expect(after[sheedy!.name]?.fatigue ?? 0).toBeLessThan(after[conlon!.name]?.fatigue ?? 0);
    const tired = {
      [sheedy!.name]: { fatigue: 60, sharpness: 40 },
      [conlon!.name]: { fatigue: 60, sharpness: 40 },
    };
    const recovered = applyTraining([sheedy!, conlon!], tired, "recovery").condition;
    expect(recovered[sheedy!.name]?.fatigue ?? 0).toBeLessThan(recovered[conlon!.name]?.fatigue ?? 0);
  });

  it("treats a stored recovery plan as light intensity with only a small lift", () => {
    const squad = ratedSquad("ballyea").slice(0, 2);
    const rested = squad[0]!;
    const working = squad[1]!;
    const start = Object.fromEntries(squad.map((item) => [item.name, { ...defaultCondition(), fatigue: 40 }]));
    const plans = {
      [rested.name]: { ...physicalPlan, recovery: true },
      [working.name]: physicalPlan,
    };
    const after = applyTraining(squad, start, "mixed", plans, undefined, undefined, "intense");
    expect(after.condition[rested.name]?.fatigue ?? 0).toBeLessThan(start[rested.name]!.fatigue);
    expect(after.condition[working.name]?.fatigue ?? 0).toBeGreaterThan(start[working.name]!.fatigue);
    expect(after.deltas[rested.name]?.speed ?? 0).toBeGreaterThan(0);
    expect(after.deltas[working.name]?.speed ?? 0).toBeGreaterThan(after.deltas[rested.name]?.speed ?? 0);
  });

  it("lets a player keep a lighter intensity than the rest of the panel", () => {
    const squad = ratedSquad("ballyea").slice(0, 2);
    const easy = squad[0]!;
    const hard = squad[1]!;
    const start = Object.fromEntries(squad.map((item) => [item.name, defaultCondition()]));
    const plans = {
      [easy.name]: { ...physicalPlan, intensity: "light" as const },
      [hard.name]: { ...physicalPlan, intensity: "intense" as const },
    };
    const after = applyTraining(squad, start, "mixed", plans, undefined, undefined, "balanced");
    expect(after.deltas[hard.name]?.speed ?? 0).toBeGreaterThan(after.deltas[easy.name]?.speed ?? 0);
    expect(after.condition[easy.name]?.fatigue ?? 0).toBeLessThan(after.condition[hard.name]?.fatigue ?? 0);
  });

  it("raises teamwork when the same lads play the same positions", () => {
    const squad = ratedSquad("ballyea");
    const sheet = defaultSheet("ballyea");
    const start = Object.fromEntries(squad.map((player) => [player.name, defaultCondition()]));
    const first = applyTeamwork(start, sheet, undefined, "competitive");
    const again = applyTeamwork(first.condition, sheet, first.lastSheet, "competitive");
    const name = sheet.starters[0]!;
    expect(first.condition[name]?.boosts?.teamwork).toBeCloseTo(0.06);
    expect(again.condition[name]?.boosts?.teamwork).toBeCloseTo(0.18);
    const moved = {
      starters: [...sheet.starters.slice(1), sheet.starters[0]!],
      subs: sheet.subs,
    };
    const shuffled = applyTeamwork(first.condition, moved, first.lastSheet, "competitive");
    expect(shuffled.condition[name]?.boosts?.teamwork).toBeCloseTo(0.12);
  });

  it("tires the panel more on intense work than on light work, and lifts more keys", () => {
    const squad = ratedSquad("ballyea").slice(0, 4);
    const player = squad[0]!;
    const start = Object.fromEntries(squad.map((item) => [item.name, defaultCondition()]));
    const plans = Object.fromEntries(squad.map((item) => [item.name, physicalPlan]));
    const light = applyTraining(squad, start, "mixed", plans, undefined, undefined, "light");
    const intense = applyTraining(squad, start, "mixed", plans, undefined, undefined, "intense");
    expect(intense.condition[player.name]?.fatigue ?? 0).toBeGreaterThan(light.condition[player.name]?.fatigue ?? 0);
    expect(intense.deltas[player.name]?.speed ?? 0).toBeGreaterThan(light.deltas[player.name]?.speed ?? 0);
  });

  it("runs three preseason sessions before the week turns, and only ticks injuries on the first", () => {
    const squad = ratedSquad("ballyea");
    const sheet = defaultSheet("ballyea");
    const name = sheet.starters[0]!;
    let condition = Object.fromEntries(squad.map((player) => [player.name, defaultCondition()]));
    condition = {
      ...condition,
      [name]: {
        ...defaultCondition(),
        injury: { weeksLeft: 2, durationWeeks: 2, ailment: "hamstring", source: "match" },
      },
    };
    const run = (sessionsDone: number, current = condition) =>
      applyWeekSession({
        squad,
        condition: current,
        sheet,
        plans: {},
        phase: "preseason",
        preseasonWeek: 1,
        sessionsDone,
        intensity: "balanced",
        weekShape: "challenge",
        seed: 1,
        weekKey: `preseason-1-${sessionsDone}`,
        remainingWeeks: 12,
      });
    const first = run(0);
    expect(first.sessionsDone).toBe(1);
    expect(first.weekComplete).toBe(false);
    expect(first.trainingDue).toBe(true);
    expect(first.condition[name]?.injury?.weeksLeft).toBe(1);
    expect(first.session).toBe("mixed");
    const second = run(1, first.condition);
    expect(second.sessionsDone).toBe(2);
    expect(second.condition[name]?.injury?.weeksLeft).toBe(1);
    expect(second.session).toBe("mixed");
    const third = run(2, second.condition);
    expect(third.weekComplete).toBe(true);
    expect(third.sessionsDone).toBe(0);
    expect(third.trainingDue).toBe(false);
    expect(third.session).toBe("challenge");
    expect(third.condition[name]?.injury?.weeksLeft).toBe(1);
    expect(third.weekDeltas[name]?.teamwork ?? 0).toBeGreaterThan(0);
  });

  it("names who trained well and who did not in the weekly coach note", () => {
    const squad = ratedSquad("ballyea").slice(0, 4);
    const copy = weekCoachCopy(
      squad,
      {
        [squad[0]!.name]: { speed: 0.4, passing: -0.05 },
        [squad[1]!.name]: { speed: -0.12, passing: -0.08 },
        [squad[2]!.name]: { speed: 0.02 },
        [squad[3]!.name]: { speed: 0.22, passing: -0.04 },
      },
      "Preseason week 2",
    );
    expect(copy.title).toMatch(/coach/i);
    expect(copy.body).toContain(squad[0]!.name);
    expect(copy.body).toContain(squad[1]!.name);
    expect(copy.body).toMatch(/trained particularly well/i);
    expect(copy.body).toMatch(/did not take the work/i);
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
    expect(migrated?.version).toBe(9);
    expect(migrated?.reports).toEqual({});
    expect(migrated?.tactics.mentality).toBe("attacking");
    expect(migrated?.tactics.build).toBeGreaterThan(60);
    expect(migrated?.tactics.puckout).toBeGreaterThan(60);
    expect(migrated?.tactics.aggression).toBeGreaterThan(30);
    expect(migrated?.tactics.pressure).toBeGreaterThan(60);
    expect(migrated?.tactics.shooting).toBe(50);
    expect(migrated?.plans).toEqual({});
    expect(migrated?.phase).toBe("season");
    expect(migrated?.intensity).toBe("balanced");
    expect(migrated?.weekShape).toBe("challenge");
    expect(migrated?.sessionsDone).toBe(0);
    expect(migrated?.weekDeltas).toEqual({});
  });

  it("clamps old training boosts into the new -1 to +2 range", () => {
    const migrated = migrateSave({
      version: 7,
      clubId: "ballyea",
      seed: 3,
      tactics: { mentality: "balanced", build: 40, puckout: 40, aggression: 40, pressure: 40, shooting: 50, shape: "traditional" },
      sheet: defaultSheet("ballyea"),
      matches: [],
      inbox: [],
      condition: {
        "Tony Kelly": { fatigue: 10, sharpness: 50, boosts: { passing: 4, speed: -2 } },
      },
    });
    expect(migrated?.condition["Tony Kelly"]?.boosts?.passing).toBe(2);
    expect(migrated?.condition["Tony Kelly"]?.boosts?.speed).toBe(-1);
  });
});

describe("pre-match briefing", () => {
  it("names threats, how to nullify them, and a weakness to attack", () => {
    const match = seedChampionship.matches.find((item) => item.id === "g1-r1-a");
    expect(match).toBeTruthy();
    const built = buildPreMatchBriefing({
      clubId: "ballyea",
      match: match!,
      championship: seedChampionship,
      tactics: DEFAULT_TACTICS,
      sheet: defaultSheet("ballyea"),
      condition: {},
    });
    const body = built.notes.join(" ");
    expect(body).toMatch(/threat/i);
    expect(body).toMatch(/nullify/i);
    expect(body).toMatch(/weakness/i);
    expect(body).toMatch(/teamwork/i);
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
    for (const player of result.players) {
      if (player.shots > 0) expect(player.possessions).toBeGreaterThanOrEqual(player.shots);
      if (player.passesAttempted > 0) expect(player.possessions).toBeGreaterThan(0);
      expect(player.puckoutsWon).toBeLessThanOrEqual(player.possessions);
      expect(player.tacklesWon).toBeLessThanOrEqual(player.tacklesAttempted);
      expect(player.fitness).toBe(100 - player.fatigue);
    }
  });

  it("records frees conceded, frees taken and 65s per player", () => {
    let sawFrees = false;
    let sawSixtyFives = false;
    for (let seed = 1; seed <= 28; seed += 1) {
      const result = simulateMatch({
        matchId: "g1-r1-a",
        homeId: "ballyea",
        awayId: "inagh-kilnamona",
        homeTactics: { ...DEFAULT_TACTICS, aggression: 92 },
        awayTactics: { ...DEFAULT_TACTICS, aggression: 88 },
        climate: { sky: "sunny", windStrength: 8, windAngle: 12 },
        seed,
      });
      const sum = (pick: (row: (typeof result.players)[number]) => number) =>
        result.players.reduce((total, row) => total + pick(row), 0);
      const freesAttempted = sum((row) => row.freesAttempted ?? 0);
      const freesScored = sum((row) => row.freesScored ?? 0);
      const freesConceded = sum((row) => row.freesConceded ?? 0);
      const sixtyAttempted = sum((row) => row.sixtyFivesAttempted ?? 0);
      const sixtyScored = sum((row) => row.sixtyFivesScored ?? 0);
      const freeHits = result.events.filter((event) => event.kind === "free").length;
      const freeWides = result.events.filter((event) => event.kind === "wide" && /free/i.test(event.text)).length;
      const sixtyHits = result.events.filter((event) => event.kind === "sixtyFive").length;
      const sixtyWides = result.events.filter((event) => event.kind === "wide" && /65/i.test(event.text)).length;
      expect(freesAttempted).toBe(freeHits + freeWides);
      expect(freesScored).toBe(freeHits);
      expect(freesConceded).toBe(freesAttempted);
      expect(sixtyAttempted).toBe(sixtyHits + sixtyWides);
      expect(sixtyScored).toBe(sixtyHits);
      expect((result.homeStats.freesAttempted ?? 0) + (result.awayStats.freesAttempted ?? 0)).toBe(freesAttempted);
      expect((result.homeStats.freesConceded ?? 0) + (result.awayStats.freesConceded ?? 0)).toBe(freesConceded);
      if (freesAttempted > 0) sawFrees = true;
      if (sixtyAttempted > 0) sawSixtyFives = true;
    }
    expect(sawFrees).toBe(true);
    expect(sawSixtyFives).toBe(true);
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
        fitness: 60,
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
        fitness: 62,
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

  it("comments on teamwork after a championship day", () => {
    const notes = buildCoachReport({
      clubId: "ballyea",
      homeId: "ballyea",
      awayId: "inagh-kilnamona",
      homeName: "Ballyea",
      awayName: "Inagh-Kilnamona",
      homeTactics: DEFAULT_TACTICS,
      awayTactics: DEFAULT_TACTICS,
      homeStats: {
        teamId: "ballyea",
        possessions: 22,
        passesAttempted: 40,
        passesCompleted: 32,
        shots: 10,
        scores: 7,
        highFieldingAttempted: 6,
        highFieldingWon: 4,
        puckoutsWon: 5,
        tacklesAttempted: 8,
        tacklesWon: 5,
        groundCovered: 90,
        fatigue: 36,
        fitness: 64,
        overall: 14,
        rating: 7,
      },
      awayStats: {
        teamId: "inagh-kilnamona",
        possessions: 18,
        passesAttempted: 30,
        passesCompleted: 20,
        shots: 8,
        scores: 4,
        highFieldingAttempted: 6,
        highFieldingWon: 3,
        puckoutsWon: 4,
        tacklesAttempted: 7,
        tacklesWon: 3,
        groundCovered: 86,
        fatigue: 40,
        fitness: 60,
        overall: 13,
        rating: 6,
      },
      homeScore: { goals: 1, points: 14 },
      awayScore: { goals: 0, points: 12 },
      players: [],
      events: [],
      homeTeamwork: 17,
      awayTeamwork: 11,
    });
    expect(notes.join(" ")).toMatch(/teamwork/i);
  });

  it("moves hidden form from the display, not from sitting on the bench", () => {
    const squad = ratedSquad("ballyea");
    const sheet = defaultSheet("ballyea");
    const starter = squad.find((player) => sheet.starters.includes(player.name)) ?? squad[0]!;
    const bench = squad.find((player) => !sheet.starters.includes(player.name)) ?? squad.at(-1)!;
    const start = 52;
    const condition = Object.fromEntries(squad.map((player) => [player.name, { ...defaultCondition(), form: start }]));
    const next = applyMatchForm(
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
          fitness: 60,
          overall: 16,
          rating: 8.2,
          mood: 52,
        },
      ],
      "loss",
      7,
      "form-display",
    );
    expect(bench).toBeTruthy();
    expect(formValue(next[starter.name])).not.toBe(start);
    expect(Math.abs(formValue(next[bench.name]) - start)).toBeLessThanOrEqual(10);
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
            fitness: 80,
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
            fitness: 100,
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
              fitness: 60,
              overall: 19,
              rating: 8.4,
              mood: 70,
            },
          ],
          coachReport: [],
          climate: { sky: "sunny", windStrength: 12, windAngle: 20 },
          shots: [],
        },
      },
      "ballyea",
      "Tony Kelly",
    );
    expect(rolled.minutes).toBe(62);
    expect(rolled.scores).toBe(3);
    expect(rolled.rating).toBe(8.4);
    expect(rolled.freesConceded).toBe(0);
    expect(rolled.freesAttempted).toBe(0);
    expect(rolled.sixtyFivesAttempted).toBe(0);
  });
});

describe("match fitness", () => {
  it("starts the panel at 100 fitness and drains more under pressure, aggression and five forwards", () => {
    const squad = ratedSquad("ballyea");
    const sheet = defaultSheet("ballyea");
    expect(fitnessOf(defaultCondition())).toBe(100);
    const easy = applyMatchFatigue(
      {},
      sheet.starters,
      sheet.subs,
      { ...DEFAULT_TACTICS, pressure: 8, aggression: 8, shape: "traditional" },
      squad,
    );
    const hard = applyMatchFatigue(
      {},
      sheet.starters,
      sheet.subs,
      { ...DEFAULT_TACTICS, pressure: 96, aggression: 96, shape: "sweeper" },
      squad,
    );
    const forward = squad.find((player) => sheet.starters.includes(player.name) && (player.position === "HF" || player.position === "FF"));
    expect(forward).toBeTruthy();
    expect(hard[forward!.name]?.fatigue ?? 0).toBeGreaterThan(easy[forward!.name]?.fatigue ?? 0);
    expect(fitnessOf(hard[forward!.name] ?? defaultCondition())).toBeLessThan(fitnessOf(easy[forward!.name] ?? defaultCondition()));
    expect(isOvertrained({ fatigue: 80, sharpness: 50 })).toBe(true);
  });
});

describe("match shirts and swap confirmation", () => {
  it("numbers the fifteen 1–15 in slot order and the bench from 16", () => {
    const sheet = defaultSheet("ballyea");
    expect(matchShirtNumber(sheet, sheet.starters[0])).toBe(1);
    expect(matchShirtNumber(sheet, sheet.starters[14])).toBe(15);
    expect(matchSlot(sheet, sheet.starters[0])).toBe("GK");
    expect(matchSlot(sheet, sheet.starters[7])).toBe("MF");
    expect(matchSlot(sheet, sheet.starters[14])).toBe("FF");
    expect(matchShirtNumber(sheet, sheet.subs[0])).toBe(16);
    expect(matchSlot(sheet, sheet.subs[0])).toBe("SUB");
    expect(matchOrderIndex(sheet, sheet.subs[0])).toBe(15);
    expect(matchShirtNumber(sheet, "Nobody")).toBeUndefined();
  });

  it("does not swap until two names are picked", () => {
    expect(nextSwapPick(null, null, "A")).toEqual({ first: "A", second: null });
    expect(nextSwapPick("A", null, "B")).toEqual({ first: "A", second: "B" });
    expect(nextSwapPick("A", "B", "A")).toEqual({ first: "B", second: null });
    expect(nextSwapPick("A", "B", "C")).toEqual({ first: "A", second: "C" });
  });

  it("reads the latest match rating in championship order", () => {
    const reports = {
      first: {
        matchId: "first",
        homeId: "ballyea",
        awayId: "feakle",
        homeScore: { goals: 0, points: 0 },
        awayScore: { goals: 0, points: 0 },
        homeTactics: DEFAULT_TACTICS,
        awayTactics: DEFAULT_TACTICS,
        homeSheet: defaultSheet("ballyea"),
        awaySheet: defaultSheet("feakle"),
        homeStats: {
          teamId: "ballyea",
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
          fitness: 100,
          overall: 0,
          rating: 0,
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
          fitness: 100,
          overall: 0,
          rating: 0,
        },
        players: [
          {
            name: "Tony Kelly",
            teamId: "ballyea",
            started: true,
            minutes: 60,
            possessions: 1,
            passesAttempted: 1,
            passesCompleted: 1,
            shots: 1,
            scores: 1,
            highFieldingAttempted: 0,
            highFieldingWon: 0,
            puckoutsWon: 0,
            tacklesAttempted: 0,
            tacklesWon: 0,
            groundCovered: 1,
            fatigue: 10,
            fitness: 90,
            overall: 19,
            rating: 7.1,
            mood: 60,
          },
        ],
        coachReport: [],
      },
      second: {
        matchId: "second",
        homeId: "ballyea",
        awayId: "feakle",
        homeScore: { goals: 0, points: 0 },
        awayScore: { goals: 0, points: 0 },
        homeTactics: DEFAULT_TACTICS,
        awayTactics: DEFAULT_TACTICS,
        homeSheet: defaultSheet("ballyea"),
        awaySheet: defaultSheet("feakle"),
        homeStats: {
          teamId: "ballyea",
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
          fitness: 100,
          overall: 0,
          rating: 0,
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
          fitness: 100,
          overall: 0,
          rating: 0,
        },
        players: [
          {
            name: "Tony Kelly",
            teamId: "ballyea",
            started: true,
            minutes: 60,
            possessions: 1,
            passesAttempted: 1,
            passesCompleted: 1,
            shots: 1,
            scores: 1,
            highFieldingAttempted: 0,
            highFieldingWon: 0,
            puckoutsWon: 0,
            tacklesAttempted: 0,
            tacklesWon: 0,
            groundCovered: 1,
            fatigue: 10,
            fitness: 90,
            overall: 19,
            rating: 8.6,
            mood: 70,
          },
        ],
        coachReport: [],
      },
    };
    expect(lastMatchRating(reports, "ballyea", "Tony Kelly", ["first", "second"])).toBe(8.6);
    expect(lastMatchRating(reports, "ballyea", "Tony Kelly", ["second", "first"])).toBe(7.1);
  });
});
