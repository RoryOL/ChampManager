import type { AttributeBoosts, PlayerCondition, PositionLine, RatedPlayer, Tactics, TrainingFocus } from "../types";
import { ageResponse } from "../data/playerProfiles";
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS, clampDial, type AttributeKey } from "./attributes";
import { moodAdjust } from "./mood";
import { clampStat, computeOverall, ratedSquad } from "./players";

export const PRESEASON_WEEKS = 6;

export const PRESEASON_DATES = [
  "2026-06-12",
  "2026-06-19",
  "2026-06-26",
  "2026-07-03",
  "2026-07-10",
  "2026-07-17",
];

export const MAX_STAT_BOOST = 4;

export const TRAINING_BOOSTS: Record<TrainingFocus, AttributeKey[]> = {
  fitness: ["speed", "acceleration", "stamina"],
  skills: ["firstTouch", "passing", "strikingDistance", "vision"],
  setpieces: ["frees", "sidelines", "puckoutReach"],
  challenge: ["workrate", "underPressure", "composure", "offTheBall"],
  recovery: [],
};

export const TRAINING_OPTIONS: {
  value: TrainingFocus;
  title: string;
  copy: string;
}[] = [
  {
    value: "fitness",
    title: "Fitness",
    copy: "Slight lift to speed, acceleration and stamina on the player profile (up to +4). Younger legs take it better; older panels feel it more.",
  },
  {
    value: "skills",
    title: "Skills",
    copy: "Slight lift to first touch, passing, striking from distance and vision on the player profile.",
  },
  {
    value: "setpieces",
    title: "Set pieces",
    copy: "Slight lift to frees, sidelines and puck-out reach on the player profile. Useful, not a full session.",
  },
  {
    value: "challenge",
    title: "Challenge game",
    copy: "Slight lift to workrate, composure, under pressure and off the ball. Biggest sharpness gain, heaviest legs.",
  },
  {
    value: "recovery",
    title: "Recovery",
    copy: "Cuts fatigue so trained profile stats show through. Younger players bounce back quicker.",
  },
];

export function defaultCondition(): PlayerCondition {
  return { fatigue: 0, sharpness: 38, mood: 58 };
}

export function midSeasonCondition(): PlayerCondition {
  return { fatigue: 28, sharpness: 58, mood: 60 };
}

export function clampCondition(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function clampBoost(value: number): number {
  return Math.max(-2, Math.min(MAX_STAT_BOOST, Math.round(value)));
}

function cloneCondition(current: PlayerCondition): PlayerCondition {
  return {
    fatigue: current.fatigue,
    sharpness: current.sharpness,
    mood: current.mood,
    moodNote: current.moodNote,
    boosts: current.boosts ? { ...current.boosts } : undefined,
  };
}

export function ensureCondition(
  names: string[],
  current: Record<string, PlayerCondition>,
  fallback: PlayerCondition = defaultCondition(),
): Record<string, PlayerCondition> {
  const next = { ...current };
  for (const name of names) {
    next[name] ??= cloneCondition(fallback);
  }
  return next;
}

export function squadNames(teamId: string, gameSeed?: number): string[] {
  return ratedSquad(teamId, gameSeed).map((player) => player.name);
}

export function conditionFor(name: string, map: Record<string, PlayerCondition>): PlayerCondition {
  return map[name] ?? defaultCondition();
}

export function fitnessOf(condition: PlayerCondition): number {
  return clampCondition(100 - condition.fatigue);
}

export function isOvertrained(condition: PlayerCondition): boolean {
  return fitnessOf(condition) <= 22;
}

export function conditionAdjust(condition: PlayerCondition): number {
  let adjust = 0;
  const fitness = fitnessOf(condition);
  if (fitness <= 28) adjust -= 2;
  else if (fitness <= 50) adjust -= 1;
  if (condition.sharpness >= 80) adjust += 1;
  else if (condition.sharpness < 28) adjust -= 1;
  adjust += moodAdjust(condition);
  return adjust;
}

export function matchStat(base: number, condition: PlayerCondition, key: AttributeKey): number {
  const boost = condition.boosts?.[key] ?? 0;
  return clampStat(base + boost + conditionAdjust(condition));
}

export function matchRatings(player: RatedPlayer, condition: PlayerCondition): RatedPlayer["ratings"] {
  const ratings = {} as Record<AttributeKey, number>;
  for (const key of ATTRIBUTE_KEYS) {
    ratings[key] = matchStat(player.ratings[key], condition, key);
  }
  return {
    ...player.ratings,
    ...ratings,
    overall: computeOverall(ratings, player.ratings.familiarity, player.position),
  };
}

export function formDelta(player: RatedPlayer, condition: PlayerCondition, key?: AttributeKey): number {
  if (key) return matchStat(player.ratings[key], condition, key) - player.ratings[key];
  return matchRatings(player, condition).overall - player.ratings.overall;
}

export function boostTotal(condition: PlayerCondition): number {
  if (!condition.boosts) return 0;
  return Object.values(condition.boosts).reduce((sum, value) => sum + (value ?? 0), 0);
}

function liftBoosts(current: AttributeBoosts | undefined, keys: AttributeKey[]): AttributeBoosts {
  const next: AttributeBoosts = { ...(current ?? {}) };
  for (const key of keys) {
    next[key] = clampBoost((next[key] ?? 0) + 1);
  }
  return next;
}

function joinLabels(keys: AttributeKey[]): string {
  const labels = keys.map((key) => ATTRIBUTE_LABELS[key].toLowerCase());
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0] ?? "";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`;
}

export function applyTraining(
  squad: RatedPlayer[],
  condition: Record<string, PlayerCondition>,
  focus: TrainingFocus,
): { condition: Record<string, PlayerCondition>; overtrained: string[]; summary: string } {
  const next = { ...condition };
  const overtrained: string[] = [];
  const keys = TRAINING_BOOSTS[focus];

  for (const player of squad) {
    const current = cloneCondition(next[player.name] ?? defaultCondition());
    const alreadyHeavy = fitnessOf(current) <= 50;
    const response = ageResponse(player.age);
    let fatigue = current.fatigue;
    let sharpness = current.sharpness;
    let boosts = current.boosts;

    switch (focus) {
      case "fitness":
        fatigue += (alreadyHeavy ? 22 : 15) * response.fatigue;
        sharpness += (alreadyHeavy ? -3 : 7) * response.train;
        break;
      case "skills":
        fatigue += (alreadyHeavy ? 16 : 10) * response.fatigue;
        sharpness += (alreadyHeavy ? 1 : 6) * response.train;
        break;
      case "setpieces":
        fatigue += (alreadyHeavy ? 12 : 8) * response.fatigue;
        sharpness += (alreadyHeavy ? 1 : 5) * response.train;
        break;
      case "challenge":
        fatigue += (alreadyHeavy ? 26 : 18) * response.fatigue;
        sharpness += (alreadyHeavy ? -2 : 9) * response.train;
        break;
      case "recovery":
        fatigue -= 24 * response.recover;
        sharpness += 1 * response.train;
        break;
      default:
        break;
    }

    if (keys.length > 0) {
      boosts = liftBoosts(boosts, keys);
    }

    fatigue = clampCondition(fatigue);
    sharpness = clampCondition(sharpness);
    if (fatigue >= 78) {
      sharpness = clampCondition(sharpness - 6);
      overtrained.push(player.name);
    }
    next[player.name] = { fatigue, sharpness, boosts, mood: current.mood, moodNote: current.moodNote };
  }

  const label = TRAINING_OPTIONS.find((item) => item.value === focus)?.title ?? focus;
  const lifted = joinLabels(keys);
  const summary =
    overtrained.length > 0
      ? `${label} is done, but ${overtrained.length} player${overtrained.length === 1 ? " is" : "s are"} overtrained. The work is banked, yet match ratings look heavy until fitness recovers.`
      : focus === "recovery"
        ? "Recovery week lands. Match fitness is back up, so banked ratings show through again."
        : `${label} session is in the book. ${lifted.charAt(0).toUpperCase()}${lifted.slice(1)} are up on the player profiles — open the squad to see the numbers move.`;

  return { condition: next, overtrained, summary };
}

export function matchFatigueDelta(
  minutes: number,
  tactics: Tactics | undefined,
  position: PositionLine,
  started: boolean,
  age = 27,
): number {
  if (minutes <= 0) return 0;
  const share = Math.min(1, minutes / 62);
  const plan = tactics ?? {
    mentality: "balanced" as const,
    build: 42,
    puckout: 58,
    aggression: 46,
    pressure: 48,
    shape: "traditional" as const,
  };
  const pressure = clampDial(plan.pressure ?? 48) / 100;
  const aggression = clampDial(plan.aggression ?? 46) / 100;
  let gain = (started ? 16 : 7) * share;
  gain += pressure * 14 * share;
  gain += aggression * 10 * share;
  if (plan.shape === "sweeper" && (position === "HF" || position === "FF")) {
    gain += 9 * share;
  }
  gain *= ageResponse(age).fatigue;
  return Math.round(gain);
}

export function applyMatchFatigue(
  condition: Record<string, PlayerCondition>,
  starters: string[],
  subs: string[],
  tactics: Tactics | undefined = undefined,
  squad: RatedPlayer[] = [],
): Record<string, PlayerCondition> {
  const next = { ...condition };
  const byName = new Map(squad.map((player) => [player.name, player]));
  const bump = (name: string, started: boolean) => {
    const current = cloneCondition(next[name] ?? defaultCondition());
    const position = byName.get(name)?.position ?? "MF";
    const age = byName.get(name)?.age ?? 27;
    const add = matchFatigueDelta(62, tactics, position, started, age);
    const recover = 4 * ageResponse(age).recover;
    next[name] = {
      fatigue: clampCondition(current.fatigue + add - recover),
      sharpness: clampCondition(current.sharpness + (started ? 3 : 1)),
      boosts: current.boosts,
      mood: current.mood,
      moodNote: current.moodNote,
    };
  };
  for (const name of starters) bump(name, true);
  for (const name of subs) bump(name, false);
  return next;
}

export function averageFatigue(condition: Record<string, PlayerCondition>, names: string[]): number {
  if (names.length === 0) return 0;
  const total = names.reduce((sum, name) => sum + (condition[name]?.fatigue ?? 0), 0);
  return Math.round(total / names.length);
}

export function averageFitness(condition: Record<string, PlayerCondition>, names: string[]): number {
  return clampCondition(100 - averageFatigue(condition, names));
}

export function averageSharpness(condition: Record<string, PlayerCondition>, names: string[]): number {
  if (names.length === 0) return 0;
  const total = names.reduce((sum, name) => sum + (condition[name]?.sharpness ?? 0), 0);
  return Math.round(total / names.length);
}

export function averageMatchOverall(
  squad: RatedPlayer[],
  condition: Record<string, PlayerCondition>,
  names?: string[],
): { match: number; ability: number } {
  const picked = names ? squad.filter((player) => names.includes(player.name)) : squad;
  if (picked.length === 0) return { match: 0, ability: 0 };
  const ability = picked.reduce((sum, player) => sum + player.ratings.overall, 0) / picked.length;
  const match =
    picked.reduce((sum, player) => sum + matchRatings(player, conditionFor(player.name, condition)).overall, 0) /
    picked.length;
  return { match: Math.round(match * 10) / 10, ability: Math.round(ability * 10) / 10 };
}
