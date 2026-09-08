import { describe, expect, it } from "vitest";
import { buildCoachReport } from "./coach";
import {
  applyFormChance,
  applyMatchForm,
  displayFormDelta,
  formCoachNotes,
  formValue,
  rollStartingForm,
  withStartingForm,
} from "./form";
import { passChain } from "./matchStats";
import { migrateSave } from "./gameStorage";
import { DEFAULT_TACTICS, defaultSheet, ratedSquad } from "./players";
import { defaultCondition } from "./training";
import type { PlayerMatchStats } from "../types";

function stats(name: string, rating: number, minutes = 62): PlayerMatchStats {
  return {
    name,
    teamId: "ballyea",
    started: true,
    minutes,
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
    rating,
    mood: 52,
  };
}

describe("hidden player form", () => {
  it("rolls different starting forms for different names", () => {
    const a = rollStartingForm(11, "Tony Kelly");
    const b = rollStartingForm(11, "Cathal O'Connor");
    expect(a).toBeGreaterThanOrEqual(26);
    expect(a).toBeLessThanOrEqual(74);
    expect(b).toBeGreaterThanOrEqual(26);
    expect(b).toBeLessThanOrEqual(74);
    expect(a).not.toBe(b);
  });

  it("seeds the panel with form when none is stored", () => {
    const squad = ratedSquad("ballyea");
    const seeded = withStartingForm({}, squad.map((player) => player.name), 4);
    const values = new Set(squad.map((player) => seeded[player.name]?.form));
    expect(values.size).toBeGreaterThan(8);
    expect(squad.every((player) => typeof seeded[player.name]?.form === "number")).toBe(true);
  });

  it("makes poor form more likely to miss than good form", () => {
    expect(applyFormChance(0.6, 20)).toBeLessThan(applyFormChance(0.6, 80));
  });

  it("turns a strong or poor display into a form delta", () => {
    expect(displayFormDelta(8.2)).toBeGreaterThan(0);
    expect(displayFormDelta(5)).toBeLessThan(0);
  });

  it("raises form after a strong display when luck is ordinary", () => {
    const squad = ratedSquad("ballyea");
    const sheet = defaultSheet("ballyea");
    const starter = squad.find((player) => sheet.starters.includes(player.name)) ?? squad[0]!;
    const start = 52;
    const condition = Object.fromEntries(squad.map((player) => [player.name, { ...defaultCondition(), form: start }]));
    const next = applyMatchForm(condition, squad, sheet, sheet, [stats(starter.name, 8.2)], "win", 7, "ordinary");
    expect(formValue(next[starter.name])).toBeGreaterThan(start);
  });

  it("can still drop form after a strong display when luck is out", () => {
    const squad = ratedSquad("ballyea");
    const sheet = defaultSheet("ballyea");
    const starter = squad.find((player) => sheet.starters.includes(player.name)) ?? squad[0]!;
    const start = 52;
    const condition = Object.fromEntries(squad.map((player) => [player.name, { ...defaultCondition(), form: start }]));
    let sawDrop = false;
    for (let seed = 1; seed <= 80; seed += 1) {
      const next = applyMatchForm(condition, squad, sheet, sheet, [stats(starter.name, 8.2)], "win", seed, "luck");
      if (formValue(next[starter.name]) < start) {
        sawDrop = true;
        break;
      }
    }
    expect(sawDrop).toBe(true);
  });

  it("lets coaches name hot and cold players without quoting the number", () => {
    const hot = "Tony Kelly";
    const cold = "Cathal O'Connor";
    const notes = formCoachNotes(
      {
        [hot]: { fatigue: 10, sharpness: 60, form: 84 },
        [cold]: { fatigue: 10, sharpness: 60, form: 18 },
      },
      [hot, cold],
    );
    const copy = notes.join(" ");
    expect(copy).toContain(hot);
    expect(copy).toContain(cold);
    expect(copy).toMatch(/vein of form/i);
    expect(copy).toMatch(/out of sorts/i);
    expect(copy).not.toMatch(/\b84\b/);
    expect(copy).not.toMatch(/\b18\b/);
  });

  it("adds form lines to the match coach report", () => {
    const notes = buildCoachReport({
      clubId: "ballyea",
      homeId: "ballyea",
      awayId: "feakle",
      homeName: "Ballyea",
      awayName: "Feakle",
      homeTactics: DEFAULT_TACTICS,
      awayTactics: DEFAULT_TACTICS,
      homeStats: {
        teamId: "ballyea",
        possessions: 20,
        passesAttempted: 30,
        passesCompleted: 22,
        shots: 8,
        scores: 5,
        highFieldingAttempted: 4,
        highFieldingWon: 2,
        puckoutsWon: 4,
        tacklesAttempted: 8,
        tacklesWon: 4,
        groundCovered: 90,
        fatigue: 40,
        fitness: 60,
        overall: 13,
        rating: 6,
      },
      awayStats: {
        teamId: "feakle",
        possessions: 18,
        passesAttempted: 28,
        passesCompleted: 20,
        shots: 7,
        scores: 4,
        highFieldingAttempted: 4,
        highFieldingWon: 2,
        puckoutsWon: 3,
        tacklesAttempted: 7,
        tacklesWon: 3,
        groundCovered: 88,
        fatigue: 40,
        fitness: 60,
        overall: 13,
        rating: 6,
      },
      homeScore: { goals: 1, points: 14 },
      awayScore: { goals: 0, points: 12 },
      players: [stats("Tony Kelly", 8.1)],
      events: [],
      condition: { "Tony Kelly": { fatigue: 12, sharpness: 62, form: 86 } },
    });
    const copy = notes.join(" ");
    expect(copy).toContain("Tony Kelly");
    expect(copy).toMatch(/vein of form/i);
    expect(copy).not.toMatch(/\b86\b/);
  });

  it("upgrades old saves to version 10 and fills missing form", () => {
    const migrated = migrateSave({
      version: 8,
      clubId: "ballyea",
      seed: 3,
      tactics: { mentality: "balanced", build: 40, puckout: 40, aggression: 40, pressure: 40, shooting: 50, shape: "traditional" },
      sheet: defaultSheet("ballyea"),
      matches: [],
      inbox: [],
    });
    expect(migrated?.version).toBe(12);
    const names = ratedSquad("ballyea", 3).map((player) => player.name);
    expect(names.every((name) => typeof migrated?.condition[name]?.form === "number")).toBe(true);
    const values = new Set(names.map((name) => migrated?.condition[name]?.form));
    expect(values.size).toBeGreaterThan(8);
  });

  it("turns a first-touch fumble into a miscontrol, not a pass", () => {
    const moved = passChain(["A", "B"], "ballyea", () => 0.01, 2, "A", 0.99, () => 0.5);
    expect(moved.retained).toBe(false);
    expect(moved.copy).toMatch(/miscontrol/i);
    expect(moved.credits.some((credit) => (credit.passesAttempted ?? 0) > 0)).toBe(false);
  });
});
