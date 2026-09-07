import type {
  AttributeBoosts,
  PlayerCondition,
  PlayerPlan,
  PositionLine,
  RatedPlayer,
  Tactics,
  TeamSheet,
  TrainingMix,
  TrainingPlans,
  TrainingType,
  WeekSession,
} from "../types";
import { ageResponse } from "../data/playerProfiles";
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS, MENTAL_KEYS, clampDial, type AttributeKey } from "./attributes";
import { isInjured } from "./injuries";
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

export const TRAINING_TYPES: TrainingType[] = ["defensive", "attacking", "tactics", "physical", "setpieces"];

export const TRAINING_TYPE_KEYS: Record<TrainingType, AttributeKey[]> = {
  defensive: ["hooking", "manMarking"],
  attacking: ["shooting", "offTheBall"],
  tactics: ["passing", "vision", "firstTouch"],
  physical: ["strength", "speed", "acceleration"],
  setpieces: ["frees", "sidelines", "puckoutReach"],
};

export const TRAINING_TYPE_OPTIONS: { value: TrainingType; title: string; copy: string }[] = [
  { value: "defensive", title: "Defensive", copy: "Tackling / hooking and man marking." },
  { value: "attacking", title: "Attacking", copy: "Shooting and off the ball." },
  { value: "tactics", title: "Tactics", copy: "Passing, vision and first touch." },
  { value: "physical", title: "Physical", copy: "Strength, speed and acceleration." },
  { value: "setpieces", title: "Set pieces", copy: "Frees, sidelines and puck-out reach." },
];

export const SESSION_OPTIONS: { value: WeekSession; title: string; copy: string }[] = [
  {
    value: "mixed",
    title: "Individual schedules",
    copy: "Each player splits the week across defensive, attacking, tactics, physical and set-piece work. Mental attributes stay as they are.",
  },
  {
    value: "challenge",
    title: "Challenge match",
    copy: "A midweek game for the fifteen. Teamwork rises when the same lads play together in the same positions. Heavier legs.",
  },
  {
    value: "recovery",
    title: "Recovery week",
    copy: "The whole panel eases off so match fitness comes back. Banked training still shows once the legs are fresh.",
  },
];

export function emptyMix(): TrainingMix {
  return { defensive: 0, attacking: 0, tactics: 0, physical: 0, setpieces: 0 };
}

export function defaultMixFor(line: PositionLine): TrainingMix {
  switch (line) {
    case "GK":
      return { defensive: 10, attacking: 0, tactics: 25, physical: 20, setpieces: 45 };
    case "FB":
      return { defensive: 40, attacking: 0, tactics: 20, physical: 30, setpieces: 10 };
    case "HB":
      return { defensive: 30, attacking: 5, tactics: 30, physical: 25, setpieces: 10 };
    case "MF":
      return { defensive: 20, attacking: 15, tactics: 25, physical: 30, setpieces: 10 };
    case "HF":
      return { defensive: 10, attacking: 30, tactics: 30, physical: 20, setpieces: 10 };
    case "FF":
      return { defensive: 5, attacking: 40, tactics: 25, physical: 10, setpieces: 20 };
    default:
      return { defensive: 20, attacking: 20, tactics: 20, physical: 20, setpieces: 20 };
  }
}

export function mixTotal(mix: TrainingMix): number {
  return TRAINING_TYPES.reduce((sum, type) => sum + (mix[type] ?? 0), 0);
}

export function normalizeMix(mix: TrainingMix): TrainingMix {
  const raw = TRAINING_TYPES.map((type) => Math.max(0, Math.round(mix[type] ?? 0)));
  const total = raw.reduce((sum, value) => sum + value, 0);
  if (total <= 0) return emptyMix();
  const next = emptyMix();
  let used = 0;
  TRAINING_TYPES.forEach((type, index) => {
    if (index === TRAINING_TYPES.length - 1) {
      next[type] = Math.max(0, 100 - used);
      return;
    }
    const share = Math.round(((raw[index] ?? 0) / total) * 100);
    next[type] = share;
    used += share;
  });
  return next;
}

export function setMixShare(mix: TrainingMix, type: TrainingType, value: number): TrainingMix {
  const clamped = Math.max(0, Math.min(100, Math.round(value)));
  const others = TRAINING_TYPES.filter((item) => item !== type);
  const rest = others.reduce((sum, item) => sum + (mix[item] ?? 0), 0);
  const leftover = 100 - clamped;
  const next = emptyMix();
  next[type] = clamped;
  if (rest <= 0) {
    const first = others[0];
    if (first) next[first] = leftover;
    return next;
  }
  let used = 0;
  others.forEach((item, index) => {
    if (index === others.length - 1) {
      next[item] = Math.max(0, leftover - used);
      return;
    }
    const share = Math.round(((mix[item] ?? 0) / rest) * leftover);
    next[item] = share;
    used += share;
  });
  return next;
}

export function planFor(name: string, plans: TrainingPlans, position: PositionLine): PlayerPlan {
  const stored = plans[name];
  if (stored) {
    return { mix: normalizeMix(stored.mix), recovery: stored.recovery === true };
  }
  return { mix: defaultMixFor(position), recovery: false };
}

export function applyPlansToSquad(squad: RatedPlayer[], template: PlayerPlan): TrainingPlans {
  const next: TrainingPlans = {};
  for (const player of squad) {
    next[player.name] = { mix: normalizeMix(template.mix), recovery: template.recovery };
  }
  return next;
}

export function mixSummary(mix: TrainingMix): string {
  const parts = TRAINING_TYPE_OPTIONS.filter((option) => (mix[option.value] ?? 0) > 0).map(
    (option) => `${option.title} ${mix[option.value]}%`,
  );
  return parts.length > 0 ? parts.join(" · ") : "No work set";
}

export function dominantType(mix: TrainingMix): TrainingType | null {
  let best: TrainingType | null = null;
  let value = 0;
  for (const type of TRAINING_TYPES) {
    if ((mix[type] ?? 0) > value) {
      best = type;
      value = mix[type] ?? 0;
    }
  }
  return value > 0 ? best : null;
}

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
    injury: current.injury ? { ...current.injury } : undefined,
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
  if (condition.injury && condition.injury.weeksLeft > 0) adjust -= 5;
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

export const TRAINING_OPTIONS = SESSION_OPTIONS;

function liftBoosts(current: AttributeBoosts | undefined, keys: AttributeKey[], amount = 1): AttributeBoosts {
  const next: AttributeBoosts = { ...(current ?? {}) };
  for (const key of keys) {
    if (MENTAL_KEYS.includes(key)) continue;
    next[key] = clampBoost((next[key] ?? 0) + amount);
  }
  return next;
}

function liftFromMix(current: AttributeBoosts | undefined, mix: TrainingMix): AttributeBoosts {
  let next = current;
  for (const type of TRAINING_TYPES) {
    const share = mix[type] ?? 0;
    if (share < 10) continue;
    const keys = TRAINING_TYPE_KEYS[type];
    if (share >= 50) {
      next = liftBoosts(next, keys);
    } else if (share >= 25) {
      next = liftBoosts(next, keys.slice(0, Math.min(2, keys.length)));
    } else {
      next = liftBoosts(next, keys.slice(0, 1));
    }
  }
  return next ?? {};
}

function sessionLoad(mix: TrainingMix, alreadyHeavy: boolean): { fatigue: number; sharpness: number } {
  const physical = (mix.physical ?? 0) / 100;
  const defensive = (mix.defensive ?? 0) / 100;
  const attacking = (mix.attacking ?? 0) / 100;
  const tactics = (mix.tactics ?? 0) / 100;
  const setpieces = (mix.setpieces ?? 0) / 100;
  const fatigue =
    physical * (alreadyHeavy ? 22 : 15) +
    defensive * (alreadyHeavy ? 18 : 12) +
    attacking * (alreadyHeavy ? 16 : 10) +
    tactics * (alreadyHeavy ? 16 : 10) +
    setpieces * (alreadyHeavy ? 12 : 8);
  const sharpness =
    physical * (alreadyHeavy ? -3 : 7) +
    defensive * (alreadyHeavy ? 0 : 5) +
    attacking * (alreadyHeavy ? 1 : 6) +
    tactics * (alreadyHeavy ? 1 : 6) +
    setpieces * (alreadyHeavy ? 1 : 5);
  return { fatigue, sharpness };
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
  session: WeekSession,
  plans: TrainingPlans = {},
  sheet?: TeamSheet,
  previous?: TeamSheet,
): { condition: Record<string, PlayerCondition>; overtrained: string[]; summary: string; lastSheet?: TeamSheet } {
  const next = { ...condition };
  const overtrained: string[] = [];
  const lifted = new Set<AttributeKey>();
  const used = new Set([...(sheet?.starters ?? []), ...(sheet?.subs ?? [])]);

  for (const player of squad) {
    const current = cloneCondition(next[player.name] ?? defaultCondition());
    if (isInjured(current)) {
      next[player.name] = current;
      continue;
    }
    const plan = planFor(player.name, plans, player.position);
    const recovery = session === "recovery" || plan.recovery;
    const inChallenge = session === "challenge" && used.has(player.name);
    const alreadyHeavy = fitnessOf(current) <= 50;
    const response = ageResponse(player.age);
    let fatigue = current.fatigue;
    let sharpness = current.sharpness;
    let boosts = current.boosts;

    if (recovery) {
      fatigue -= 24 * response.recover;
      sharpness += 1 * response.train;
    } else if (inChallenge) {
      fatigue += (alreadyHeavy ? 26 : 18) * response.fatigue;
      sharpness += (alreadyHeavy ? -2 : 9) * response.train;
    } else if (session === "challenge") {
      fatigue -= 12 * response.recover;
      sharpness += 1 * response.train;
    } else {
      const load = sessionLoad(plan.mix, alreadyHeavy);
      fatigue += load.fatigue * response.fatigue;
      sharpness += load.sharpness * response.train;
      const before = boosts;
      boosts = liftFromMix(boosts, plan.mix);
      for (const key of ATTRIBUTE_KEYS) {
        if ((boosts[key] ?? 0) > (before?.[key] ?? 0)) lifted.add(key);
      }
    }

    fatigue = clampCondition(fatigue);
    sharpness = clampCondition(sharpness);
    if (fatigue >= 78) {
      sharpness = clampCondition(sharpness - 6);
      overtrained.push(player.name);
    }
    next[player.name] = {
      fatigue,
      sharpness,
      boosts,
      mood: current.mood,
      moodNote: current.moodNote,
      injury: current.injury,
    };
  }

  let lastSheet = sheet;
  if (session === "challenge" && sheet) {
    const teamworked = applyTeamwork(next, sheet, previous, "challenge");
    Object.assign(next, teamworked.condition);
    lastSheet = teamworked.lastSheet;
  }

  const label = SESSION_OPTIONS.find((item) => item.value === session)?.title ?? session;
  const liftedText = joinLabels([...lifted]);
  const summary =
    overtrained.length > 0
      ? `${label} is done, but ${overtrained.length} player${overtrained.length === 1 ? " is" : "s are"} overtrained. The work is banked, yet match ratings look heavy until fitness recovers.`
      : session === "recovery"
        ? "Recovery week lands. Match fitness is back up, so banked ratings show through again."
        : session === "challenge"
          ? "Challenge match is in the book. Teamwork lifts when the same lads stay in the same positions. Mental attributes did not move."
          : liftedText
            ? `${label} session is in the book. ${liftedText.charAt(0).toUpperCase()}${liftedText.slice(1)} are up on the player profiles — open the squad to see the numbers move. Workrate and composure stay as they are.`
            : `${label} session is in the book. Open the squad to see who took a lift. Workrate and composure stay as they are.`;

  return { condition: next, overtrained, summary, lastSheet };
}

export function applyTeamwork(
  condition: Record<string, PlayerCondition>,
  sheet: TeamSheet,
  previous?: TeamSheet,
  kind: "challenge" | "competitive" = "competitive",
): { condition: Record<string, PlayerCondition>; lastSheet: TeamSheet } {
  const next = { ...condition };
  const returning = new Set(previous?.starters ?? []);

  const bump = (name: string, amount: number) => {
    if (amount <= 0) return;
    const current = cloneCondition(next[name] ?? defaultCondition());
    const boosts = liftBoosts(current.boosts, ["teamwork"], amount);
    next[name] = { ...current, boosts };
  };

  sheet.starters.forEach((name, index) => {
    let amount = 1;
    if (previous?.starters[index] === name) amount += 1;
    bump(name, amount);
  });
  for (const name of sheet.subs) {
    bump(name, kind === "competitive" && returning.has(name) ? 1 : 0);
  }
  return { condition: next, lastSheet: { starters: [...sheet.starters], subs: [...sheet.subs] } };
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
    shooting: 50,
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
      injury: current.injury,
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
