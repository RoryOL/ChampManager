import { describe, expect, it } from "vitest";
import { seedChampionship } from "./data/championship";
import { applyInjury, injuryChance, rollInjuryWeeks, sitInjuredPlayers, tickInjuries } from "./lib/injuries";
import { applyNewsMood } from "./lib/mood";
import {
  ambitionFor,
  chairmanWelcome,
  clubRank,
  localPressItem,
  matchReportItem,
  migrateNewsItem,
} from "./lib/news";
import { migrateSave, newSave } from "./lib/gameStorage";
import { defaultSheet, ratedSquad } from "./lib/players";
import { simulateMatch } from "./lib/matchEngine";
import { defaultCondition } from "./lib/training";

describe("chairman ambition", () => {
  it("asks more of the panel than the ranking strictly deserves, but still tracks relative strength", () => {
    const strongest = [...seedChampionship.teams].sort((a, b) => clubRank(a.id) - clubRank(b.id))[0]!;
    const weakest = [...seedChampionship.teams].sort((a, b) => clubRank(b.id) - clubRank(a.id))[0]!;
    const top = ambitionFor(strongest.id);
    const bottom = ambitionFor(weakest.id);
    expect(clubRank(strongest.id)).toBe(1);
    expect(clubRank(weakest.id)).toBe(seedChampionship.teams.length);
    expect(["canon", "final"]).toContain(top.target);
    expect(["group", "quarter", "semi"]).toContain(bottom.target);
    expect(top.target === "canon" || bottom.target !== "canon").toBe(true);
    expect(top.line.toLowerCase()).toContain("canon");
    expect(bottom.line.toLowerCase()).not.toContain("canon hamilton");
  });

  it("writes a welcome that names the club and the year's intention", () => {
    const club = seedChampionship.teams.find((team) => team.id === "ocallaghans-mills")!;
    const { item, ambition } = chairmanWelcome({ club, seed: 7, date: "2026-06-12" });
    expect(item.kind).toBe("chairman");
    expect(item.title).toMatch(/Mills|O'Callaghan/i);
    expect(item.body.toLowerCase()).toContain("intention");
    expect(item.read).toBe(false);
    expect(["group", "quarter", "semi", "final", "canon"]).toContain(ambition);
  });
});

describe("injuries", () => {
  it("makes older, exhausted players more likely to go down than young fit ones", () => {
    const squad = ratedSquad("ballyea");
    const veteran = [...squad].sort((a, b) => b.age - a.age)[0]!;
    const kid = [...squad].sort((a, b) => a.age - b.age)[0]!;
    const tired = injuryChance(veteran, { fatigue: 82, sharpness: 30 }, "match");
    const fresh = injuryChance(kid, { fatigue: 0, sharpness: 70 }, "match");
    expect(veteran.age).toBeGreaterThan(kid.age);
    expect(tired).toBeGreaterThan(fresh);
    expect(injuryChance(veteran, { fatigue: 82, sharpness: 30 }, "training", "challenge")).toBeGreaterThan(
      injuryChance(veteran, { fatigue: 82, sharpness: 30 }, "training", "recovery"),
    );
  });

  it("rolls absences between one week and the remaining season", () => {
    const player = ratedSquad("ballyea")[0]!;
    const rng = () => 0.99;
    expect(rollInjuryWeeks(rng, 12, player, { fatigue: 80, sharpness: 20 })).toBe(12);
    expect(rollInjuryWeeks(() => 0.01, 12, player, defaultCondition())).toBe(1);
  });

  it("ticks injuries off the weeks and sits the player from the fifteen", () => {
    const squad = ratedSquad("clooney-quin");
    const name = defaultSheet("clooney-quin").starters[0]!;
    const injured = applyInjury({}, name, {
      weeksLeft: 2,
      durationWeeks: 2,
      ailment: "hamstring",
      source: "training",
    });
    const sheet = sitInjuredPlayers(defaultSheet("clooney-quin"), squad, injured);
    expect(sheet.starters).not.toContain(name);
    const mid = tickInjuries(injured, squad);
    expect(mid.recovered).toEqual([]);
    expect(mid.condition[name]?.injury?.weeksLeft).toBe(1);
    const done = tickInjuries(mid.condition, squad);
    expect(done.recovered).toEqual([name]);
    expect(done.condition[name]?.injury).toBeUndefined();
  });
});

describe("match and press news", () => {
  it("names who played well in the club match report", () => {
    const sim = simulateMatch({
      matchId: "g3-r1-a",
      homeId: "clooney-quin",
      awayId: "cratloe",
      seed: 42,
    });
    const item = matchReportItem({
      clubId: "clooney-quin",
      clubName: "Clooney-Quin",
      homeName: "Clooney-Quin",
      awayName: "Cratloe",
      homeScore: sim.homeScore,
      awayScore: sim.awayScore,
      sim,
      date: "2026-07-24",
      seed: 42,
      stageLabel: "Round 1",
    });
    expect(item.kind).toBe("match");
    expect(item.matchId).toBe("g3-r1-a");
    const ours = sim.players.filter((row) => row.teamId === "clooney-quin" && row.minutes > 0);
    const top = [...ours].sort((a, b) => b.rating - a.rating)[0];
    expect(top).toBeTruthy();
    expect(item.body).toContain(top!.name);
  });

  it("lets a negative paper report knock panel happiness", () => {
    const club = seedChampionship.teams.find((team) => team.id === "broadford")!;
    const opponent = seedChampionship.teams.find((team) => team.id === "ballyea")!;
    const press = localPressItem({
      club,
      opponent,
      ourScore: { goals: 0, points: 8 },
      theirScore: { goals: 2, points: 22 },
      result: "loss",
      date: "2026-08-01",
      seed: 11,
      matchId: "test-loss",
      ambition: "canon",
      played: 1,
    });
    expect(press.kind).toBe("press");
    expect(press.tone).toBe("negative");
    const squad = ratedSquad("broadford");
    const start = Object.fromEntries(squad.map((player) => [player.name, defaultCondition()]));
    const next = applyNewsMood(
      start,
      squad.map((player) => player.name),
      -7,
      "The local paper went after the team.",
    );
    expect(next[squad[0]!.name]?.mood ?? 58).toBeLessThan(start[squad[0]!.name]?.mood ?? 58);
  });
});

describe("save news migration", () => {
  it("keeps old inbox copy and fills ambition", () => {
    const migrated = migrateSave({
      version: 4,
      clubId: "ballyea",
      seed: 3,
      tactics: { mentality: "balanced", build: 40, puckout: 40, aggression: 40, pressure: 40, shooting: 50, shape: "traditional" },
      sheet: defaultSheet("ballyea"),
      matches: [],
      inbox: [{ id: "old", title: "Welcome to Ballyea", body: "Preseason is underway.", date: "2026-06-12" }],
    });
    expect(migrated?.version).toBe(6);
    expect(migrated?.ambition).toBe(ambitionFor("ballyea").target);
    expect(migrated?.inbox[0]?.kind).toBe("training");
    expect(newSave("ballyea").ambition).toBe(ambitionFor("ballyea").target);
    expect(migrateNewsItem({ title: "x", body: "y", matchId: "g1" })?.kind).toBe("match");
  });
});
