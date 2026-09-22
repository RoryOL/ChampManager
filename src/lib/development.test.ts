import { describe, expect, it } from "vitest";
import { championshipFromSave, migrateSave, newSave } from "./gameStorage";
import { advancePlayer, continueChampionship, trainingKeepShare, youthAgeFactor } from "./development";
import { ratedSquad } from "./players";
import type { DevelopmentBank } from "./development";
import type { RatedPlayer } from "../types";

function find(clubId: string, name: string, seed = 7): RatedPlayer {
  const player = ratedSquad(clubId, seed).find((item) => item.name === name);
  if (!player) throw new Error(`Missing ${name}`);
  return player;
}

function runSeasons(player: RatedPlayer, seasons: { games: number; form: number }[]): RatedPlayer {
  let current = player;
  let bank: DevelopmentBank = {};
  for (const usage of seasons) {
    const advanced = advancePlayer(current, usage, bank);
    bank = advanced.bank;
    current = { ...current, age: advanced.age, ratings: advanced.ratings };
  }
  return current;
}

describe("winter development", () => {
  it("grows quickly at 19 and flattens by 25", () => {
    expect(youthAgeFactor(19)).toBe(1);
    expect(youthAgeFactor(21)).toBeGreaterThan(youthAgeFactor(23));
    expect(youthAgeFactor(24)).toBeGreaterThan(0);
    expect(youthAgeFactor(25)).toBe(0);
    expect(youthAgeFactor(32)).toBe(0);
  });

  it("lifts a young player who played in form, and not one who sat or was out of sorts", () => {
    const thomas = find("st-josephs", "Thomas O'Connor");
    const played = advancePlayer(thomas, { games: 5, form: 74 });
    expect(played.age).toBe(thomas.age + 1);
    expect(played.ratings.speed).toBeGreaterThan(thomas.ratings.speed);
    expect(played.ratings.overall).toBeGreaterThanOrEqual(thomas.ratings.overall);

    const cold = advancePlayer(thomas, { games: 4, form: 40 });
    expect(cold.ratings.speed).toBe(thomas.ratings.speed);
    expect(cold.steps.find((step) => step.key === "speed")?.delta).toBe(0);

    const cameo = advancePlayer(thomas, { games: 1, form: 80 });
    expect(cameo.ratings.speed).toBe(thomas.ratings.speed);

    const career = runSeasons(
      thomas,
      Array.from({ length: 6 }, () => ({ games: 5, form: 74 })),
    );
    expect(career.age).toBe(25);
    expect(career.ratings.overall).toBeGreaterThan(thomas.ratings.overall);
    const held = advancePlayer(career, { games: 5, form: 74 });
    expect(held.ratings.overall).toBeLessThanOrEqual(career.ratings.overall + 1);
    expect(held.steps.find((step) => step.key === "shooting")?.delta ?? 0).toBeLessThan(0.2);
  });

  it("lets composure rise through the peak years", () => {
    const ryan = find("cratloe", "Diarmuid Ryan");
    const later = runSeasons(
      ryan,
      Array.from({ length: 5 }, () => ({ games: 5, form: 64 })),
    );
    expect(later.ratings.composure).toBeGreaterThan(ryan.ratings.composure);
    expect(later.ratings.overall).toBeGreaterThanOrEqual(ryan.ratings.overall - 1);
  });

  it("keeps a share of the year's training, more of it when the player is young", () => {
    expect(trainingKeepShare(19, 0.5)).toBeGreaterThan(trainingKeepShare(25, 0.5));
    expect(trainingKeepShare(25, 0.5)).toBeGreaterThan(trainingKeepShare(34, 0.5));
    expect(trainingKeepShare(19, 1)).toBeGreaterThan(trainingKeepShare(19, 0));
    expect(trainingKeepShare(38, 0)).toBe(0);

    const thomas = find("st-josephs", "Thomas O'Connor");
    const tony = find("ballyea", "Tony Kelly");
    const boosts = { speed: 1.2, shooting: 0.8 };
    const young = advancePlayer(thomas, { games: 5, form: 74 }, {}, { boosts, seed: 11 });
    const bare = advancePlayer(thomas, { games: 5, form: 74 }, {}, { boosts: {}, seed: 11 });
    const old = advancePlayer(tony, { games: 5, form: 70 }, {}, { boosts, seed: 11 });
    const youngSpeed = young.steps.find((step) => step.key === "speed")!;
    const bareSpeed = bare.steps.find((step) => step.key === "speed")!;
    const oldSpeed = old.steps.find((step) => step.key === "speed")!;
    expect(youngSpeed.trainingKept).toBeGreaterThan(0);
    expect(youngSpeed.trainingKept).toBeLessThan(1.2);
    expect(youngSpeed.delta).toBeCloseTo(youngSpeed.natural + youngSpeed.trainingKept, 5);
    expect(youngSpeed.delta).toBeGreaterThan(bareSpeed.delta);
    expect(youngSpeed.trainingKept).toBeGreaterThan(oldSpeed.trainingKept);

    const neglected = advancePlayer(thomas, { games: 5, form: 74 }, {}, { boosts: { speed: -0.8 }, seed: 11 });
    expect(neglected.steps.find((step) => step.key === "speed")?.trainingKept).toBe(0);
    expect(neglected.steps.find((step) => step.key === "speed")?.delta).toBe(bareSpeed.delta);

    const otherWinter = advancePlayer(thomas, { games: 5, form: 74 }, {}, { boosts, seed: 99 });
    expect(otherWinter.steps.find((step) => step.key === "speed")?.trainingKept).not.toBe(youngSpeed.trainingKept);
  });

  it("drops pace faster when a player over 29 does not play", () => {
    const tony = find("ballyea", "Tony Kelly");
    const played = runSeasons(
      tony,
      Array.from({ length: 4 }, () => ({ games: 5, form: 60 })),
    );
    const benched = runSeasons(
      tony,
      Array.from({ length: 4 }, () => ({ games: 0, form: 46 })),
    );
    expect(benched.ratings.speed).toBeLessThan(played.ratings.speed);
    expect(benched.ratings.speed).toBeLessThan(tony.ratings.speed);
    expect(played.ratings.shooting).toBeGreaterThanOrEqual(tony.ratings.shooting - 1);
  });
});

describe("continue championship", () => {
  it("keeps the panel, ages them, and opens the next year", () => {
    const rolled = newSave("st-josephs");
    const base = { ...rolled, seed: 7 };
    const before = ratedSquad("st-josephs", base);
    const thomas = before.find((player) => player.name === "Thomas O'Connor")!;
    const reports = Object.fromEntries(
      [1, 2, 3, 4, 5].map((index) => [
        `m${index}`,
        { players: [{ teamId: "st-josephs", name: thomas.name, minutes: 58 }] },
      ]),
    );
    const next = continueChampionship({
      ...base,
      tactics: { ...base.tactics, mentality: "attacking" },
      condition: {
        ...base.condition,
        [thomas.name]: { ...(base.condition[thomas.name] ?? { fatigue: 0, sharpness: 40 }), form: 74 },
      },
      reports: reports as typeof base.reports,
    });

    expect(next.year).toBe(2027);
    expect(next.phase).toBe("preseason");
    expect(next.preseasonWeek).toBe(1);
    expect(next.tactics.mentality).toBe("attacking");
    expect(next.seasonWrap).toBeUndefined();
    expect(next.matches.every((match) => match.homeScore == null && match.awayScore == null)).toBe(true);
    expect(next.inbox[0]?.title).toBe("The winter panel");

    const after = ratedSquad("st-josephs", next);
    const thomasAfter = after.find((player) => player.name === thomas.name)!;
    expect(thomasAfter.age).toBe(thomas.age + 1);
    expect(thomasAfter.ratings.speed).toBeGreaterThan(thomas.ratings.speed);

    const tonyBefore = ratedSquad("ballyea", base).find((player) => player.name === "Tony Kelly")!;
    const tonyAfter = ratedSquad("ballyea", next).find((player) => player.name === "Tony Kelly")!;
    expect(tonyAfter.age).toBe(tonyBefore.age + 1);
    expect(tonyAfter.ratings.speed).toBeLessThan(tonyBefore.ratings.speed);

    const championship = championshipFromSave(next);
    expect(championship.year).toBe(2027);
    expect(championship.matches[0]?.date.startsWith("2027-")).toBe(true);

    const again = continueChampionship(next);
    const thomasLater = ratedSquad("st-josephs", again).find((player) => player.name === thomas.name)!;
    expect(again.year).toBe(2028);
    expect(thomasLater.age).toBe(thomas.age + 2);
    expect(thomasLater.ratings.speed).toBe(thomasAfter.ratings.speed);
  });

  it("writes a share of training onto the card and clears the seasonal lift", () => {
    const rolled = newSave("st-josephs");
    const base = { ...rolled, seed: 7 };
    const thomas = ratedSquad("st-josephs", base).find((player) => player.name === "Thomas O'Connor")!;
    const reports = Object.fromEntries(
      [1, 2, 3, 4, 5].map((index) => [
        `m${index}`,
        { players: [{ teamId: "st-josephs", name: thomas.name, minutes: 58 }] },
      ]),
    );
    const condition = {
      ...base.condition,
      [thomas.name]: {
        ...(base.condition[thomas.name] ?? { fatigue: 0, sharpness: 40 }),
        form: 74,
        boosts: { shooting: 1.6 },
      },
    };
    const withTraining = continueChampionship({
      ...base,
      condition,
      reports: reports as typeof base.reports,
    });
    const without = continueChampionship({
      ...base,
      condition: {
        ...condition,
        [thomas.name]: { ...condition[thomas.name], boosts: undefined },
      },
      reports: reports as typeof base.reports,
    });
    const trained = withTraining.careers?.["st-josephs"]?.[thomas.name];
    const plain = without.careers?.["st-josephs"]?.[thomas.name];
    const kept =
      (trained?.ratings.shooting ?? 0) -
      (plain?.ratings.shooting ?? 0) +
      ((trained?.bank?.shooting ?? 0) - (plain?.bank?.shooting ?? 0));
    expect(kept).toBeGreaterThan(0.2);
    expect(kept).toBeLessThan(1.6);
    expect(withTraining.condition[thomas.name]?.boosts).toBeUndefined();
  });

  it("keeps a carried panel on a migrated save", () => {
    const save = newSave("ballyea");
    const next = continueChampionship({ ...save, seed: 7 });
    const migrated = migrateSave(next);
    expect(migrated?.year).toBe(2027);
    expect(migrated?.careers?.ballyea?.["Tony Kelly"]?.age).toBe(
      ratedSquad("ballyea", next).find((player) => player.name === "Tony Kelly")?.age,
    );
    expect(migrated?.development?.ballyea?.["Tony Kelly"]?.map((snap) => snap.year)).toEqual(
      next.development?.ballyea?.["Tony Kelly"]?.map((snap) => snap.year),
    );
  });
});

describe("development log", () => {
  it("records the opening card and each winter after it", () => {
    const rolled = newSave("st-josephs");
    const save = { ...rolled, seed: 7 };
    const thomas = ratedSquad("st-josephs", save).find((player) => player.name === "Thomas O'Connor")!;
    expect(save.development?.["st-josephs"]?.[thomas.name]?.map((snap) => snap.year)).toEqual([2026]);

    const reports = Object.fromEntries(
      [1, 2, 3, 4, 5].map((index) => [
        `m${index}`,
        { players: [{ teamId: "st-josephs", name: thomas.name, minutes: 58 }] },
      ]),
    );
    const next = continueChampionship({
      ...save,
      condition: {
        ...save.condition,
        [thomas.name]: { ...(save.condition[thomas.name] ?? { fatigue: 0, sharpness: 40 }), form: 74 },
      },
      reports: reports as typeof save.reports,
    });
    const history = next.development?.["st-josephs"]?.[thomas.name];
    expect(history?.map((snap) => snap.year)).toEqual([2026, 2027]);
    expect(history?.[0]?.ratings.speed).toBe(thomas.ratings.speed);
    expect(history?.[1]?.ratings.speed).toBeGreaterThan(thomas.ratings.speed);
    expect(history?.[1]?.age).toBe(thomas.age + 1);

    const again = continueChampionship(next);
    expect(again.development?.["st-josephs"]?.[thomas.name]?.map((snap) => snap.year)).toEqual([2026, 2027, 2028]);
  });

  it("shows a veteran slipping and a recruit from the year he arrives", () => {
    const save = { ...newSave("ballyea"), seed: 7 };
    const tony = ratedSquad("ballyea", save).find((player) => player.name === "Tony Kelly")!;
    const next = continueChampionship(save);
    const history = next.development?.ballyea?.["Tony Kelly"];
    expect(history?.[1]?.ratings.speed).toBeLessThan(history?.[0]?.ratings.speed ?? tony.ratings.speed);
    expect(history?.[1]?.ratings.speed).toBe(
      ratedSquad("ballyea", next).find((player) => player.name === "Tony Kelly")?.ratings.speed,
    );

    let recruit: string | undefined;
    let years: number[] | undefined;
    for (let seed = 1; seed <= 24 && !recruit; seed += 1) {
      const rolled = continueChampionship({ ...newSave("clonlara"), seed });
      const found = Object.entries(rolled.careers?.clonlara ?? {}).find(([, career]) => career.joined && !career.retired);
      if (!found) continue;
      recruit = found[0];
      years = rolled.development?.clonlara?.[found[0]]?.map((snap) => snap.year);
    }
    expect(recruit).toBeTruthy();
    expect(years).toEqual([2027]);
  });

  it("rebuilds start and now when an older save has no log", () => {
    const save = { ...newSave("ballyea"), seed: 7 };
    const next = continueChampionship(save);
    const migrated = migrateSave({ ...next, development: undefined });
    const logged = next.development?.ballyea?.["Tony Kelly"];
    const rebuilt = migrated?.development?.ballyea?.["Tony Kelly"];
    expect(rebuilt?.map((snap) => snap.year)).toEqual([2026, 2027]);
    expect(rebuilt?.[0]?.ratings.speed).toBe(logged?.[0]?.ratings.speed);
    expect(rebuilt?.[1]?.ratings.speed).toBe(logged?.[1]?.ratings.speed);
    expect(rebuilt?.[1]?.overall).toBe(logged?.[1]?.overall);
  });
});
