import type { PlayerCondition, PlayerMatchStats, RatedPlayer, TeamSheet } from "../types";
import { createRng, pickOne, seedFrom } from "./rng";

export const DEFAULT_FORM = 52;
export const HIGH_FORM = 72;
export const LOW_FORM = 32;

export function clampForm(value: number): number {
  return Math.max(8, Math.min(92, Math.round(value)));
}

export function formValue(condition: PlayerCondition | undefined): number {
  if (!condition) return DEFAULT_FORM;
  if (typeof condition.form === "number") return condition.form;
  if (typeof condition.mood === "number") return condition.mood;
  return DEFAULT_FORM;
}

/** −1 poor … 0 average … +1 flying */
export function formFactor(condition: PlayerCondition | undefined): number {
  return (formValue(condition) - 50) / 42;
}

export function applyFormChance(chance: number, form: number, weight = 0.24): number {
  const factor = (form - 50) / 42;
  return Math.min(0.96, Math.max(0.08, chance * (1 + factor * weight)));
}

export function fumbleChance(firstTouch: number, form: number): number {
  const raw = 0.14 - firstTouch * 0.006;
  return Math.min(0.28, Math.max(0.015, applyFormChance(raw, 100 - form, 0.45)));
}

export function rollStartingForm(seed: number, name: string): number {
  const random = createRng(seedFrom(`${seed}:${name}:form`));
  return clampForm(26 + (random() + random() + random()) * 16);
}

export function withStartingForm(
  condition: Record<string, PlayerCondition>,
  names: string[],
  seed: number,
): Record<string, PlayerCondition> {
  const next = { ...condition };
  for (const name of names) {
    const current = next[name] ?? { fatigue: 0, sharpness: 38 };
    if (typeof current.form === "number") {
      next[name] = current;
      continue;
    }
    next[name] = {
      ...current,
      form: typeof current.mood === "number" ? clampForm(current.mood) : rollStartingForm(seed, name),
    };
  }
  return next;
}

export function displayFormDelta(rating: number): number {
  return (rating - 6.4) * 4.6;
}

export function applyMatchForm(
  condition: Record<string, PlayerCondition>,
  squad: RatedPlayer[],
  opening: TeamSheet,
  closing: TeamSheet,
  players: PlayerMatchStats[],
  result: "win" | "draw" | "loss",
  seed = 1,
  matchId = "match",
): Record<string, PlayerCondition> {
  const next = { ...condition };
  const stats = new Map(players.map((row) => [row.name, row]));
  const used = new Set([...opening.starters, ...closing.starters, ...opening.subs, ...closing.subs]);

  for (const player of squad) {
    const current = { ...(next[player.name] ?? { fatigue: 0, sharpness: 38 }) };
    let form = formValue(current);
    const random = createRng(seedFrom(`${seed}:${matchId}:${player.name}:form`));
    const noise = Math.round((random() - 0.5) * 18);
    const row = stats.get(player.name);
    const played = Boolean(row && row.minutes >= 12);

    if (played && row) {
      form += displayFormDelta(row.rating) + noise;
    } else if (used.has(player.name)) {
      form += noise * 0.45 + (result === "win" ? 1 : result === "loss" ? -1 : 0);
    } else {
      form += (DEFAULT_FORM - form) * 0.12 + noise * 0.55;
    }

    next[player.name] = { ...current, form: clampForm(form) };
  }
  return next;
}

function joinNames(names: string[]): string {
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** Coach-facing copy only — never include the numeric form. */
export function formCoachNotes(
  condition: Record<string, PlayerCondition> | undefined,
  names?: string[],
  seed = 1,
): string[] {
  if (!condition) return [];
  const pool = names && names.length > 0 ? names : Object.keys(condition);
  const hot: string[] = [];
  const cold: string[] = [];
  for (const name of pool) {
    const value = formValue(condition[name]);
    if (value >= HIGH_FORM) hot.push(name);
    else if (value <= LOW_FORM) cold.push(name);
  }
  const random = createRng(seedFrom(`form-notes:${seed}:${hot.join(",")}:${cold.join(",")}`));
  const notes: string[] = [];
  if (hot.length > 0) {
    const who = joinNames(hot.slice(0, 3));
    const looks = hot.length === 1 ? "looks" : "look";
    notes.push(
      pickOne(random, [
        `${who} ${looks} in a vein of form. The striking and first touch are there.`,
        `${who} ${looks} flying. Keep feeding ${hot.length === 1 ? "him" : "them"} while the eye is in.`,
        `${who} ${hot.length === 1 ? "has" : "have"} the hurling in the legs — first touch, striking, the lot.`,
        `${who} ${looks} like ${hot.length === 1 ? "a man" : "men"} you build the next attack around. Ride the vein of form.`,
      ]),
    );
  }
  if (cold.length > 0) {
    const who = joinNames(cold.slice(0, 3));
    const looks = cold.length === 1 ? "looks" : "look";
    notes.push(
      pickOne(random, [
        `${who} ${looks} out of sorts — the touch is off and scores that should drop are drifting.`,
        `${who} ${looks} off colour. The first touch is heavy and the pocket is a yard away.`,
        `${who} ${looks} a yard off it. Sit ${cold.length === 1 ? "him" : "them"} if the marker is winning, or simplify the role.`,
        `${who} ${looks} out of sorts. Do not ask him to take the hard strike until the touch comes back.`,
      ]),
    );
  }
  return notes;
}
