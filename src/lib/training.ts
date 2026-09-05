import type { AttributeBoosts, PlayerCondition, RatedPlayer, TrainingFocus } from "../types";
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS, type AttributeKey } from "./attributes";
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
    copy: "Lifts speed, acceleration and stamina on the squad card (up to +4). Fatigue climbs fast.",
  },
  {
    value: "skills",
    title: "Skills",
    copy: "Lifts first touch, passing, striking from distance and vision — those bars move after the session.",
  },
  {
    value: "setpieces",
    title: "Set pieces",
    copy: "Lifts frees, sidelines and puck-out reach. Useful, not a full session.",
  },
  {
    value: "challenge",
    title: "Challenge game",
    copy: "Lifts workrate, composure, under pressure and off the ball. Biggest sharpness gain, heaviest legs.",
  },
  {
    value: "recovery",
    title: "Recovery",
    copy: "Cuts fatigue so banked form shows through. Match ratings hold; sharpness holds.",
  },
];

export function defaultCondition(): PlayerCondition {
  return { fatigue: 16, sharpness: 38 };
}

export function midSeasonCondition(): PlayerCondition {
  return { fatigue: 28, sharpness: 58 };
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

export function squadNames(teamId: string): string[] {
  return ratedSquad(teamId).map((player) => player.name);
}

export function conditionFor(name: string, map: Record<string, PlayerCondition>): PlayerCondition {
  return map[name] ?? defaultCondition();
}

export function isOvertrained(condition: PlayerCondition): boolean {
  return condition.fatigue >= 78;
}

export function conditionAdjust(condition: PlayerCondition): number {
  let adjust = 0;
  if (condition.fatigue >= 78) adjust -= 2;
  else if (condition.fatigue >= 65) adjust -= 1;
  if (condition.sharpness >= 80) adjust += 1;
  else if (condition.sharpness < 28) adjust -= 1;
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
    const alreadyHeavy = current.fatigue >= 64;
    let fatigue = current.fatigue;
    let sharpness = current.sharpness;
    let boosts = current.boosts;

    switch (focus) {
      case "fitness":
        fatigue += alreadyHeavy ? 22 : 15;
        sharpness += alreadyHeavy ? -3 : 7;
        break;
      case "skills":
        fatigue += alreadyHeavy ? 16 : 10;
        sharpness += alreadyHeavy ? 1 : 6;
        break;
      case "setpieces":
        fatigue += alreadyHeavy ? 12 : 8;
        sharpness += alreadyHeavy ? 1 : 5;
        break;
      case "challenge":
        fatigue += alreadyHeavy ? 26 : 18;
        sharpness += alreadyHeavy ? -2 : 9;
        break;
      case "recovery":
        fatigue -= 24;
        sharpness += 1;
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
    next[player.name] = { fatigue, sharpness, boosts };
  }

  const label = TRAINING_OPTIONS.find((item) => item.value === focus)?.title ?? focus;
  const lifted = joinLabels(keys);
  const summary =
    overtrained.length > 0
      ? `${label} is done, but ${overtrained.length} player${overtrained.length === 1 ? " is" : "s are"} overtrained. The work is banked, yet match ratings look heavy until you recover.`
      : focus === "recovery"
        ? "Recovery week lands. Legs are fresher, so banked match ratings show through again."
        : `${label} session is in the book. Match ratings for ${lifted} are up — open the squad to see the bars move. Natural ability stays the same.`;

  return { condition: next, overtrained, summary };
}

export function applyMatchFatigue(
  condition: Record<string, PlayerCondition>,
  starters: string[],
  subs: string[],
): Record<string, PlayerCondition> {
  const next = { ...condition };
  const bump = (name: string, fatigueAdd: number, sharpAdd: number) => {
    const current = cloneCondition(next[name] ?? defaultCondition());
    next[name] = {
      fatigue: clampCondition(current.fatigue + fatigueAdd - 6),
      sharpness: clampCondition(current.sharpness + sharpAdd),
      boosts: current.boosts,
    };
  };
  for (const name of starters) bump(name, 14, 3);
  for (const name of subs) bump(name, 6, 1);
  return next;
}

export function averageFatigue(condition: Record<string, PlayerCondition>, names: string[]): number {
  if (names.length === 0) return 0;
  const total = names.reduce((sum, name) => sum + (condition[name]?.fatigue ?? 0), 0);
  return Math.round(total / names.length);
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
