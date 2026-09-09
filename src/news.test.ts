import { describe, expect, it } from "vitest";
import { seedChampionship } from "./data/championship";
import { applyInjury, bestBenchForSlot, injuryChance, insertInjuryEvents, isInjured, rollInjuryWeeks, sitInjuredPlayers, tickInjuries } from "./lib/injuries";
import {
  ambitionFor,
  chairmanAfterMatch,
  chairmanWelcome,
  clubRank,
  localPressItem,
  matchReportItem,
  migrateNewsItem,
  NEWS_KIND_ICON,
  NEWS_KIND_LABEL,
} from "./lib/news";
import { migrateSave, newSave } from "./lib/gameStorage";
import { coachPickSheet, defaultSheet, ratedSquad } from "./lib/players";
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
    expect(injuryChance(veteran, { fatigue: 50, sharpness: 30 }, "match")).toBeGreaterThan(
      injuryChance(veteran, { fatigue: 20, sharpness: 30 }, "match"),
    );
    expect(injuryChance(veteran, { fatigue: 80, sharpness: 30 }, "match")).toBe(
      injuryChance(veteran, { fatigue: 50, sharpness: 30 }, "match"),
    );
    expect(injuryChance(veteran, { fatigue: 82, sharpness: 30 }, "training", "challenge", "intense")).toBeGreaterThan(
      injuryChance(veteran, { fatigue: 82, sharpness: 30 }, "training", "recovery", "intense"),
    );
    expect(injuryChance(veteran, { fatigue: 82, sharpness: 30 }, "training", "mixed", "balanced")).toBe(0);
    expect(injuryChance(veteran, { fatigue: 82, sharpness: 30 }, "training", "mixed", "light")).toBe(0);
    expect(injuryChance(veteran, { fatigue: 82, sharpness: 30 }, "training", "mixed", "intense")).toBeGreaterThan(0);
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
    expect(sheet.subs).toContain(name);
    const mid = tickInjuries(injured, squad);
    expect(mid.recovered).toEqual([]);
    expect(mid.condition[name]?.injury?.weeksLeft).toBe(1);
    const done = tickInjuries(mid.condition, squad);
    expect(done.recovered).toEqual([name]);
    expect(done.condition[name]?.injury).toBeUndefined();
  });

  it("brings on the best remaining sub for the injured starter's slot", () => {
    const squad = ratedSquad("ballyea");
    const sheet = defaultSheet("ballyea");
    const gk = sheet.starters[0]!;
    const best = bestBenchForSlot(sheet, squad, 0, new Set([gk]))!;
    const other = sheet.subs.find((name) => name !== best)!;
    const arranged = { starters: sheet.starters, subs: [other, ...sheet.subs.filter((name) => name !== other)] };
    const injured = applyInjury({}, gk, {
      weeksLeft: 3,
      durationWeeks: 3,
      ailment: "hamstring",
      source: "match",
    });
    const next = sitInjuredPlayers(arranged, squad, injured);
    expect(next.starters[0]).toBe(best);
    expect(arranged.subs[0]).toBe(other);
    expect(next.starters[0]).not.toBe(other);
  });

  it("inserts an immediate sub event when a starter goes down", () => {
    const squad = ratedSquad("ballyea");
    const sheet = defaultSheet("ballyea");
    const outgoing = sheet.starters[0]!;
    const incoming = bestBenchForSlot(sheet, squad, 0, new Set([outgoing]))!;
    const sim = simulateMatch({
      matchId: "g1-r1-a",
      homeId: "ballyea",
      awayId: "kilmaley",
      homeSheet: sheet,
      seed: 9,
    });
    const rolled = {
      name: outgoing,
      minute: 12,
      injury: { weeksLeft: 3, durationWeeks: 3, ailment: "hamstring", source: "match" as const },
      event: {
        minute: 12,
        teamId: "ballyea",
        playerName: outgoing,
        kind: "injury" as const,
        text: `${outgoing} is in trouble.`,
      },
    };
    const next = insertInjuryEvents(sim, [rolled], { clubId: "ballyea", squad, sheet });
    const injuryAt = next.events.findIndex((event) => event.kind === "injury" && event.playerName === outgoing);
    expect(injuryAt).toBeGreaterThanOrEqual(0);
    expect(next.events[injuryAt + 1]?.kind).toBe("sub");
    expect(next.events[injuryAt + 1]?.playerName).toBe(incoming);
    expect(next.homeSheet.starters[0]).toBe(incoming);
  });
});

describe("news kinds", () => {
  it("gives every inbox kind a label and a left-side icon path", () => {
    const kinds = Object.keys(NEWS_KIND_LABEL) as (keyof typeof NEWS_KIND_LABEL)[];
    expect(kinds.length).toBeGreaterThanOrEqual(7);
    for (const kind of kinds) {
      expect(NEWS_KIND_LABEL[kind].length).toBeGreaterThan(0);
      expect(NEWS_KIND_ICON[kind].length).toBeGreaterThan(10);
    }
  });
});

describe("coach team pick", () => {
  it("names a unique fifteen by slot and the rest of the panel on the bench", () => {
    const squad = ratedSquad("ballyea");
    const sheet = coachPickSheet(squad, {});
    expect(sheet.starters).toHaveLength(15);
    expect(sheet.subs).toHaveLength(squad.length - 15);
    expect(new Set([...sheet.starters, ...sheet.subs]).size).toBe(squad.length);
    const gk = squad.find((player) => player.name === sheet.starters[0]);
    expect(gk?.position).toBe("GK");
    expect(sheet.starters).toContain("Tony Kelly");
  });

  it("sits an injured star and still fills the fifteen", () => {
    const squad = ratedSquad("ballyea");
    const injured = applyInjury({}, "Tony Kelly", {
      weeksLeft: 3,
      durationWeeks: 3,
      ailment: "hamstring",
      source: "training",
    });
    const sheet = coachPickSheet(squad, injured);
    expect(sheet.starters).not.toContain("Tony Kelly");
    expect(sheet.starters).toHaveLength(15);
    const gk = squad.find((player) => player.name === sheet.starters[0]);
    expect(gk?.position).toBe("GK");
    expect(isInjured(injured[sheet.starters[0]!])).toBe(false);
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
  });

  it("writes a longer press note that names a club man for the Clare panel", () => {
    const sim = simulateMatch({
      matchId: "g1-r1-a",
      homeId: "ballyea",
      awayId: "kilmaley",
      seed: 21,
    });
    const club = seedChampionship.teams.find((team) => team.id === "ballyea")!;
    const opponent = seedChampionship.teams.find((team) => team.id === "kilmaley")!;
    const ours = sim.players.filter((row) => row.teamId === "ballyea" && row.minutes > 0);
    const ourTotal = sim.homeId === "ballyea" ? sim.homeScore : sim.awayScore;
    const theirTotal = sim.homeId === "ballyea" ? sim.awayScore : sim.homeScore;
    const margin =
      ourTotal.goals * 3 + ourTotal.points - (theirTotal.goals * 3 + theirTotal.points);
    const press = localPressItem({
      club,
      opponent,
      ourScore: ourTotal,
      theirScore: theirTotal,
      result: margin > 0 ? "win" : margin < 0 ? "loss" : "draw",
      date: "2026-07-24",
      seed: 21,
      matchId: sim.matchId,
      ambition: "canon",
      played: 1,
      players: sim.players,
    });
    const top = [...ours].sort((a, b) => b.rating - a.rating)[0];
    expect(press.body.length).toBeGreaterThan(280);
    expect(press.body).toMatch(/throw-in|puck-out|sliotar|hurling/i);
    expect(press.body).toMatch(/brought into the Clare|Clare senior panel|county call-up|Banner panel|Banner set-up/i);
    expect(top).toBeTruthy();
    expect(press.body).toContain(top!.name);
  });
});

describe("chairman after a championship day", () => {
  const club = seedChampionship.teams.find((team) => team.id === "ballyea")!;
  const opponent = seedChampionship.teams.find((team) => team.id === "broadford")!;

  it("goes over the top after a statement win", () => {
    const titles = new Set<string>();
    const bodies = new Set<string>();
    for (let seed = 1; seed <= 24; seed += 1) {
      const item = chairmanAfterMatch({
        club,
        opponent,
        ourScore: { goals: 3, points: 22 },
        theirScore: { goals: 0, points: 9 },
        result: "win",
        date: "2026-08-01",
        seed,
        matchId: `ott-${seed}`,
        ambition: "canon",
      });
      expect(item).toBeTruthy();
      expect(item!.tone).toBe("positive");
      expect(item!.body).toMatch(
        /finest hour|hurling from the gods|genius|immortals|open-top|kiss every|poetry|transformed this place|monuments|coming home/i,
      );
      titles.add(item!.title);
      bodies.add(item!.body);
    }
    expect(titles.size).toBeGreaterThanOrEqual(4);
    expect(bodies.size).toBeGreaterThanOrEqual(4);
  });

  it("cuts after a hiding", () => {
    const titles = new Set<string>();
    const bodies = new Set<string>();
    for (let seed = 1; seed <= 24; seed += 1) {
      const item = chairmanAfterMatch({
        club,
        opponent,
        ourScore: { goals: 0, points: 7 },
        theirScore: { goals: 2, points: 24 },
        result: "loss",
        date: "2026-08-01",
        seed,
        matchId: `cut-${seed}`,
        ambition: "canon",
      });
      expect(item).toBeTruthy();
      expect(item!.tone).toBe("negative");
      expect(item!.body).toMatch(
        /embarrassment|soft as butter|laughing|disgrace|humiliated|wrong man|waste my winter|schoolboy|worst hour|delusional|stood there/i,
      );
      titles.add(item!.title);
      bodies.add(item!.body);
    }
    expect(titles.size).toBeGreaterThanOrEqual(4);
    expect(bodies.size).toBeGreaterThanOrEqual(4);
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
    expect(migrated?.version).toBe(15);
    expect(migrated?.ambition).toBe(ambitionFor("ballyea").target);
    expect(migrated?.inbox[0]?.kind).toBe("training");
    expect(newSave("ballyea").ambition).toBe(ambitionFor("ballyea").target);
    expect(migrateNewsItem({ title: "x", body: "y", matchId: "g1" })?.kind).toBe("match");
  });
});
