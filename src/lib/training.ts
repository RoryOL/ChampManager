import type {
  AttributeBoosts,
  CalendarPhase,
  MatchPrep,
  PlayerCondition,
  PlayerPlan,
  PositionLine,
  RatedPlayer,
  Tactics,
  TeamSheet,
  TrainingIntensity,
  TrainingMix,
  TrainingPlans,
  TrainingType,
  WeekSession,
  WeekShape,
} from "../types";
import { ageResponse } from "../data/playerProfiles";
import { ATTRIBUTE_KEYS, ATTRIBUTE_LABELS, MENTAL_KEYS, clampDial, type AttributeKey } from "./attributes";
import { formCoachNotes } from "./form";
import {
  applyInjury,
  isInjured,
  rollTrainingInjuries,
  sitInjuredPlayers,
  tickInjuries,
  type RolledInjury,
} from "./injuries";
import { clampStat, computeOverallRaw, ratedSquad } from "./players";

export const PRESEASON_WEEKS = 6;

export const PRESEASON_DATES = [
  "2026-06-12",
  "2026-06-19",
  "2026-06-26",
  "2026-07-03",
  "2026-07-10",
  "2026-07-17",
];

export const MAX_STAT_BOOST = 2;
export const MIN_STAT_BOOST = -1;
const BOOST_PIVOT = 0.18;
const MIX_LIFT = 0.18;
const MIX_DECAY = 0.12;
const VISIBLE_LIFT = 0.01;
const TEAMWORK_STARTER = 0.06;
const TEAMWORK_SAME_SLOT = 0.12;
const TEAMWORK_BENCH = 0.04;

export const TRAINING_TYPES: TrainingType[] = ["defensive", "attacking", "tactics", "physical", "setpieces"];

export const TRAINING_TYPE_KEYS: Record<TrainingType, AttributeKey[]> = {
  defensive: ["hooking", "manMarking"],
  attacking: ["shooting", "offTheBall"],
  tactics: ["passing", "vision", "firstTouch"],
  physical: ["strength", "speed", "acceleration"],
  setpieces: ["frees", "sidelines", "puckoutReach"],
};

/** Profile stats that mixed training or teamwork can actually move. */
export const TRAINABLE_KEYS: AttributeKey[] = [
  ...TRAINING_TYPES.flatMap((type) => TRAINING_TYPE_KEYS[type]),
  "teamwork",
];

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

export const IN_SEASON_SESSION_OPTIONS = SESSION_OPTIONS.filter((option) => option.value !== "recovery");

export const MATCH_PREP_LIFT = 1;

export const MATCH_PREP_OPTIONS: { value: MatchPrep; title: string; copy: string }[] = [
  {
    value: "puckout",
    title: "Puckout strategy",
    copy: "Restarts, targets and keeper reach. A slight lift on championship day.",
  },
  {
    value: "shooting",
    title: "Shot selection",
    copy: "When to pull the trigger and how clean the strike is.",
  },
  {
    value: "marking",
    title: "Man marking",
    copy: "Stay with your man, hooks and covering.",
  },
  {
    value: "running",
    title: "Running game",
    copy: "Carry, support runs and first touch at pace.",
  },
];

export const MATCH_PREP_KEYS: Record<MatchPrep, AttributeKey[]> = {
  puckout: ["puckoutReach", "highFielding", "aerialReach", "passing"],
  shooting: ["shooting", "strikingDistance", "composure", "offTheBall"],
  marking: ["manMarking", "hooking", "strength", "workrate"],
  running: ["speed", "acceleration", "firstTouch", "passing"],
};

export function isMatchPrep(value: unknown): value is MatchPrep {
  return MATCH_PREP_OPTIONS.some((option) => option.value === value);
}

export function matchPrepTitle(prep: MatchPrep): string {
  return MATCH_PREP_OPTIONS.find((option) => option.value === prep)?.title ?? "Match work";
}

export const INTENSITY_OPTIONS: { value: TrainingIntensity; title: string; copy: string }[] = [
  {
    value: "light",
    title: "Light",
    copy: "Legs come back strongly and attributes only tick a little. Nobody picks up a training injury.",
  },
  {
    value: "balanced",
    title: "Balanced",
    copy: "A normal week. Legs come back a little. Lifts come through without dumping match fitness, and without training injuries.",
  },
  {
    value: "intense",
    title: "Intense",
    copy: "Faster lifts, heavier legs, and a real chance of picking up a knock in training. Neglected areas rust a little quicker.",
  },
];

export const WEEK_SHAPE_OPTIONS: { value: WeekShape; title: string; copy: string }[] = [
  {
    value: "challenge",
    title: "Two sessions + challenge",
    copy: "Two mixed sessions, then a challenge match for the fifteen.",
  },
  {
    value: "triple",
    title: "Three sessions",
    copy: "Three mixed sessions and no midweek game.",
  },
];

export type SquadTemplateId = "position" | "balanced" | "defensive" | "attacking" | "tactics" | "physical" | "setpieces";

export const SQUAD_TEMPLATES: { id: SquadTemplateId; title: string; copy: string; mix?: TrainingMix }[] = [
  { id: "position", title: "By position", copy: "Each man works the split for his line." },
  {
    id: "balanced",
    title: "Balanced",
    copy: "Even split across the five areas.",
    mix: { defensive: 20, attacking: 20, tactics: 20, physical: 20, setpieces: 20 },
  },
  {
    id: "defensive",
    title: "Defensive",
    copy: "Tackling and marking first.",
    mix: { defensive: 50, attacking: 5, tactics: 20, physical: 20, setpieces: 5 },
  },
  {
    id: "attacking",
    title: "Attacking",
    copy: "Shooting and movement first.",
    mix: { defensive: 5, attacking: 50, tactics: 20, physical: 20, setpieces: 5 },
  },
  {
    id: "tactics",
    title: "Tactics",
    copy: "Passing, vision and first touch.",
    mix: { defensive: 10, attacking: 10, tactics: 50, physical: 20, setpieces: 10 },
  },
  {
    id: "physical",
    title: "Physical",
    copy: "Speed, strength and acceleration.",
    mix: { defensive: 10, attacking: 10, tactics: 15, physical: 55, setpieces: 10 },
  },
  {
    id: "setpieces",
    title: "Set pieces",
    copy: "Frees, sidelines and puck-outs.",
    mix: { defensive: 5, attacking: 10, tactics: 20, physical: 15, setpieces: 50 },
  },
];

export const DEFAULT_INTENSITY: TrainingIntensity = "balanced";
export const DEFAULT_WEEK_SHAPE: WeekShape = "challenge";

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

export function planIntensity(plan: PlayerPlan, squadIntensity: TrainingIntensity): TrainingIntensity {
  if (plan.intensity === "light" || plan.intensity === "balanced" || plan.intensity === "intense") {
    return plan.intensity;
  }
  if (plan.recovery) return "light";
  return squadIntensity;
}

export function intensityTitle(intensity: TrainingIntensity): string {
  return INTENSITY_OPTIONS.find((option) => option.value === intensity)?.title ?? intensity;
}

export function planFor(name: string, plans: TrainingPlans, position: PositionLine): PlayerPlan {
  const stored = plans[name];
  if (stored) {
    const intensity =
      stored.intensity === "light" || stored.intensity === "balanced" || stored.intensity === "intense"
        ? stored.intensity
        : stored.recovery === true
          ? "light"
          : undefined;
    return { mix: normalizeMix(stored.mix), recovery: stored.recovery === true, intensity };
  }
  return { mix: defaultMixFor(position), recovery: false };
}

export function applyPlansToSquad(squad: RatedPlayer[], template: PlayerPlan): TrainingPlans {
  const next: TrainingPlans = {};
  for (const player of squad) {
    next[player.name] = {
      mix: normalizeMix(template.mix),
      recovery: false,
      intensity: template.intensity,
    };
  }
  return next;
}

export function applyTemplateToPlayers(
  squad: RatedPlayer[],
  current: TrainingPlans,
  templateId: SquadTemplateId,
  names: string[],
): TrainingPlans {
  const wanted = new Set(names);
  const next = { ...current };
  const preset = SQUAD_TEMPLATES.find((item) => item.id === templateId);
  for (const player of squad) {
    if (!wanted.has(player.name)) continue;
    const existing = next[player.name];
    if (templateId === "position" || !preset?.mix) {
      next[player.name] = { mix: defaultMixFor(player.position), recovery: false, intensity: existing?.intensity };
    } else {
      next[player.name] = { mix: normalizeMix(preset.mix), recovery: false, intensity: existing?.intensity };
    }
  }
  return next;
}

export function applyIntensityToPlayers(
  squad: RatedPlayer[],
  current: TrainingPlans,
  names: string[],
  intensity: TrainingIntensity | undefined,
): TrainingPlans {
  const wanted = new Set(names);
  const next = { ...current };
  for (const player of squad) {
    if (!wanted.has(player.name)) continue;
    const plan = planFor(player.name, next, player.position);
    next[player.name] = { mix: plan.mix, recovery: false, intensity };
  }
  return next;
}

export function sessionsPerWeek(phase: CalendarPhase): number {
  return phase === "preseason" ? 3 : 1;
}

export function sessionForSlot(
  phase: CalendarPhase,
  weekShape: WeekShape,
  sessionsDone: number,
  requested: WeekSession = "mixed",
): WeekSession {
  if (phase !== "preseason") return requested;
  if (weekShape === "challenge" && sessionsDone >= 2) return "challenge";
  return "mixed";
}

export function intensityLoad(intensity: TrainingIntensity): { fatigue: number; lift: "light" | "balanced" | "intense" } {
  if (intensity === "light") return { fatigue: 0, lift: "light" };
  if (intensity === "intense") return { fatigue: 1.45, lift: "intense" };
  return { fatigue: 0, lift: "balanced" };
}

export function mixSummary(mix: TrainingMix): string {
  const parts = TRAINING_TYPE_OPTIONS.filter((option) => (mix[option.value] ?? 0) > 0).map(
    (option) => `${option.title} ${mix[option.value]}%`,
  );
  return parts.length > 0 ? parts.join(" · ") : "No work set";
}

export function mixAbbrev(mix: TrainingMix): string {
  const parts = TRAINING_TYPE_OPTIONS.filter((option) => (mix[option.value] ?? 0) >= 15).map((option) => {
    const short = option.title === "Set pieces" ? "Set" : option.title.slice(0, 3);
    return `${short} ${mix[option.value]}`;
  });
  return parts.length > 0 ? parts.join(" · ") : "—";
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

export function staminaRecoverFactor(stamina: number): number {
  return 0.55 + Math.max(1, Math.min(20, stamina)) / 28;
}

export function recoverBetweenMatches(
  condition: Record<string, PlayerCondition>,
  squad: RatedPlayer[],
): Record<string, PlayerCondition> {
  const next: Record<string, PlayerCondition> = { ...condition };
  for (const player of squad) {
    const current = cloneCondition(next[player.name] ?? defaultCondition());
    const factor = staminaRecoverFactor(player.ratings.stamina) * ageResponse(player.age).recover;
    if (isInjured(current)) {
      next[player.name] = {
        ...current,
        fatigue: clampCondition(current.fatigue - 10 * factor),
      };
      continue;
    }
    const leftover = Math.max(0, Math.round(8 - player.ratings.stamina * 0.35));
    next[player.name] = {
      ...current,
      fatigue: leftover,
      sharpness: clampCondition(current.sharpness + 4),
    };
  }
  return next;
}

export function recoverAfterMatch(
  condition: Record<string, PlayerCondition>,
  squad: RatedPlayer[],
): { condition: Record<string, PlayerCondition>; recovered: string[] } {
  const ticked = tickInjuries(condition, squad);
  return { condition: recoverBetweenMatches(ticked.condition, squad), recovered: ticked.recovered };
}

export function liftSquadKeys(squad: RatedPlayer[], keys: AttributeKey[], amount: number): RatedPlayer[] {
  if (amount <= 0) return squad;
  return squad.map((player) => {
    const ratings = { ...player.ratings };
    for (const key of keys) {
      ratings[key] = clampStat((player.ratings[key] ?? 0) + amount);
    }
    ratings.overall = clampStat(player.ratings.overall + amount * 0.35);
    return { ...player, ratings };
  });
}

export function liftSquadForPrep(squad: RatedPlayer[], prep?: MatchPrep): RatedPlayer[] {
  if (!prep) return squad;
  return liftSquadKeys(squad, MATCH_PREP_KEYS[prep], MATCH_PREP_LIFT);
}

export function matchPrepSummary(prep: MatchPrep): string {
  return `${matchPrepTitle(prep)} is in for the next championship day. The panel have their legs back; this work gives a slight lift on that aspect only.`;
}

export function defaultCondition(): PlayerCondition {
  return { fatigue: 0, sharpness: 38 };
}

export function midSeasonCondition(): PlayerCondition {
  return { fatigue: 28, sharpness: 58 };
}

export function clampCondition(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function snapBoost(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function clampBoost(value: number): number {
  return snapBoost(Math.max(MIN_STAT_BOOST, Math.min(MAX_STAT_BOOST, value)));
}

export function mixLiftFactor(intensity: TrainingIntensity): number {
  if (intensity === "light") return 0.28;
  if (intensity === "intense") return 1.28;
  return 1;
}

function cloneCondition(current: PlayerCondition): PlayerCondition {
  return {
    fatigue: current.fatigue,
    sharpness: current.sharpness,
    form: current.form,
    mood: current.mood,
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
  if (condition.injury && condition.injury.weeksLeft > 0) adjust -= 5;
  return adjust;
}

export function matchStat(base: number, condition: PlayerCondition, key: AttributeKey): number {
  const boost = condition.boosts?.[key] ?? 0;
  return clampStat(base + boost + conditionAdjust(condition));
}

export function trainedStat(base: number, condition: PlayerCondition, key: AttributeKey): number {
  return clampStat(base + (condition.boosts?.[key] ?? 0));
}

export function trainingDelta(condition: PlayerCondition, key: AttributeKey): number {
  const value = Math.round(condition.boosts?.[key] ?? 0);
  return value === 0 ? 0 : value;
}

export function toneClass(delta: number): string {
  if (delta > 0) return "is-up";
  if (delta < 0) return "is-down";
  return "";
}

export function bankedLift(condition: PlayerCondition, key: AttributeKey): number {
  return snapBoost(condition.boosts?.[key] ?? 0);
}

/** Signed lift for the training table: banked total, or last session if nothing is banked yet. */
export function tableLift(banked: number, lastSession = 0): number {
  return snapBoost(banked !== 0 ? banked : lastSession);
}

export function formatBoostDelta(value: number): string {
  const snapped = snapBoost(value);
  if (snapped === 0) return "";
  const abs = Math.abs(snapped);
  const shown = abs >= 1 ? Math.round(snapped * 10) / 10 : Math.round(snapped * 100) / 100;
  if (shown === 0) return "";
  const body = Number.isInteger(shown) ? String(Math.abs(shown)) : Math.abs(shown).toFixed(abs >= 1 ? 1 : 2).replace(/0$/, "");
  return shown < 0 ? `-${body}` : `+${body}`;
}

export function ratingsWithBoosts(
  ratings: RatedPlayer["ratings"],
  boosts?: AttributeBoosts,
): Record<AttributeKey, number> {
  const next = {} as Record<AttributeKey, number>;
  for (const key of ATTRIBUTE_KEYS) {
    next[key] = ratings[key] + (boosts?.[key] ?? 0);
  }
  return next;
}

export function trainedOverallLift(player: RatedPlayer, boosts?: AttributeBoosts): number {
  const natural = computeOverallRaw(player.ratings, player.ratings.familiarity, player.position);
  const live = computeOverallRaw(ratingsWithBoosts(player.ratings, boosts), player.ratings.familiarity, player.position);
  return snapBoost(live - natural);
}

export function matchRatings(player: RatedPlayer, condition: PlayerCondition): RatedPlayer["ratings"] {
  const ratings = {} as Record<AttributeKey, number>;
  for (const key of ATTRIBUTE_KEYS) {
    ratings[key] = matchStat(player.ratings[key], condition, key);
  }
  const natural = computeOverallRaw(player.ratings, player.ratings.familiarity, player.position);
  const live = computeOverallRaw(ratings, player.ratings.familiarity, player.position);
  return {
    ...player.ratings,
    ...ratings,
    overall: clampStat(player.ratings.overall + (live - natural)),
  };
}

export function trainedRatings(player: RatedPlayer, condition: PlayerCondition): RatedPlayer["ratings"] {
  const ratings = {} as Record<AttributeKey, number>;
  for (const key of ATTRIBUTE_KEYS) {
    ratings[key] = trainedStat(player.ratings[key], condition, key);
  }
  const lift = trainedOverallLift(player, condition.boosts);
  return {
    ...player.ratings,
    ...ratings,
    overall: clampStat(player.ratings.overall + lift),
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

export function visibleBoostTotal(condition: PlayerCondition): number {
  if (!condition.boosts) return 0;
  return Object.values(condition.boosts).reduce((sum, value) => sum + Math.round(value ?? 0), 0);
}

export const TRAINING_OPTIONS = SESSION_OPTIONS;

function liftBoosts(current: AttributeBoosts | undefined, keys: AttributeKey[], amount: number): AttributeBoosts {
  const next: AttributeBoosts = { ...(current ?? {}) };
  for (const key of keys) {
    if (MENTAL_KEYS.includes(key)) continue;
    next[key] = clampBoost((next[key] ?? 0) + amount);
  }
  return next;
}

function liftFromMix(
  current: AttributeBoosts | undefined,
  mix: TrainingMix,
  intensity: TrainingIntensity = "balanced",
  train = 1,
  natural?: Record<AttributeKey, number>,
): AttributeBoosts {
  if (mixTotal(mix) <= 0) return current ?? {};
  const next: AttributeBoosts = { ...(current ?? {}) };
  const mul = mixLiftFactor(intensity);
  for (const type of TRAINING_TYPES) {
    const share = (mix[type] ?? 0) / 100;
    const offset = share - BOOST_PIVOT;
    const amount = offset >= 0 ? offset * MIX_LIFT * mul * train : offset * MIX_DECAY * mul;
    for (const key of TRAINING_TYPE_KEYS[type]) {
      const present = (natural?.[key] ?? 10) + (next[key] ?? 0);
      const factor = amount > 0 ? trainingGainFactor(present) : 1;
      next[key] = clampBoost((next[key] ?? 0) + amount * factor);
    }
  }
  return next;
}

/** Training lifts slow sharply once a rating is already high. */
export function trainingGainFactor(current: number): number {
  if (current >= 19) return 0.12;
  if (current >= 18) return 0.32;
  return 1;
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

function boostDeltas(before: AttributeBoosts | undefined, after: AttributeBoosts | undefined): AttributeBoosts {
  const deltas: AttributeBoosts = {};
  for (const key of ATTRIBUTE_KEYS) {
    const change = snapBoost((after?.[key] ?? 0) - (before?.[key] ?? 0));
    if (change !== 0) deltas[key] = change;
  }
  return deltas;
}

export function visibleBoostDeltas(
  before: AttributeBoosts | undefined,
  after: AttributeBoosts | undefined,
): AttributeBoosts {
  const deltas: AttributeBoosts = {};
  for (const key of ATTRIBUTE_KEYS) {
    const change = Math.round(after?.[key] ?? 0) - Math.round(before?.[key] ?? 0);
    if (change !== 0) deltas[key] = change;
  }
  return deltas;
}

export function mergeBoostMaps(
  base: Record<string, AttributeBoosts>,
  extra: Record<string, AttributeBoosts>,
): Record<string, AttributeBoosts> {
  const next: Record<string, AttributeBoosts> = { ...base };
  for (const [name, boosts] of Object.entries(extra)) {
    const merged: AttributeBoosts = { ...(next[name] ?? {}) };
    for (const key of ATTRIBUTE_KEYS) {
      const value = snapBoost((merged[key] ?? 0) + (boosts[key] ?? 0));
      if (value !== 0) merged[key] = value;
      else delete merged[key];
    }
    next[name] = merged;
  }
  return next;
}

function netNonMental(boosts: AttributeBoosts | undefined): number {
  if (!boosts) return 0;
  let sum = 0;
  for (const key of ATTRIBUTE_KEYS) {
    if (MENTAL_KEYS.includes(key)) continue;
    sum += boosts[key] ?? 0;
  }
  return snapBoost(sum);
}

function joinNames(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

export function weekCoachCopy(
  squad: RatedPlayer[],
  weekDeltas: Record<string, AttributeBoosts>,
  label: string,
  condition?: Record<string, PlayerCondition>,
): { title: string; body: string; tone: "positive" | "negative" | "neutral" } {
  const ranked = squad
    .map((player) => ({ name: player.name, net: netNonMental(weekDeltas[player.name]) }))
    .sort((a, b) => b.net - a.net);
  const standouts = ranked.filter((item) => item.net >= 0.08).slice(0, 3);
  const poor = [...ranked].reverse().filter((item) => item.net <= -0.02).slice(0, 3);
  const quiet = [...ranked]
    .reverse()
    .filter((item) => item.net > -0.02 && item.net < 0.05 && !standouts.some((star) => star.name === item.name))
    .slice(0, 3);

  const parts: string[] = [`${label} is in the book.`];
  if (standouts.length > 0) {
    parts.push(`${joinNames(standouts.map((item) => item.name))} trained particularly well.`);
  }
  if (poor.length > 0) {
    parts.push(
      `${joinNames(poor.map((item) => item.name))} did not take the work as well — neglected areas drifted.`,
    );
  } else if (quiet.length > 0 && standouts.length > 0) {
    parts.push(`${joinNames(quiet.map((item) => item.name))} barely moved.`);
  } else if (standouts.length === 0) {
    parts.push("The panel was even enough; nobody stood out and nobody fell away much.");
  }
  parts.push(...formCoachNotes(condition));
  parts.push("Small lifts stack over sessions even when the profile numbers have not ticked yet.");

  const tone =
    standouts.length > 0 && poor.length === 0
      ? "positive"
      : poor.length > 0 && standouts.length === 0
        ? "negative"
        : "neutral";
  return { title: "Coach training report", body: parts.join(" "), tone };
}

export function applyTraining(
  squad: RatedPlayer[],
  condition: Record<string, PlayerCondition>,
  session: WeekSession,
  plans: TrainingPlans = {},
  sheet?: TeamSheet,
  previous?: TeamSheet,
  intensity: TrainingIntensity = "balanced",
): {
  condition: Record<string, PlayerCondition>;
  overtrained: string[];
  summary: string;
  lastSheet?: TeamSheet;
  deltas: Record<string, AttributeBoosts>;
  visibleDeltas: Record<string, AttributeBoosts>;
} {
  const next = { ...condition };
  const overtrained: string[] = [];
  const lifted = new Set<AttributeKey>();
  const used = new Set([...(sheet?.starters ?? []), ...(sheet?.subs ?? [])]);
  const deltas: Record<string, AttributeBoosts> = {};
  const visibleDeltas: Record<string, AttributeBoosts> = {};

  for (const player of squad) {
    const current = cloneCondition(next[player.name] ?? defaultCondition());
    if (isInjured(current)) {
      next[player.name] = current;
      continue;
    }
    const plan = planFor(player.name, plans, player.position);
    const usedIntensity = planIntensity(plan, intensity);
    const loadMul = intensityLoad(usedIntensity).fatigue;
    const recovery = session === "recovery";
    const inChallenge = session === "challenge" && used.has(player.name);
    const alreadyHeavy = fitnessOf(current) <= 50;
    const response = ageResponse(player.age);
    const recoverMul = response.recover * staminaRecoverFactor(player.ratings.stamina);
    let fatigue = current.fatigue;
    let sharpness = current.sharpness;
    let boosts = current.boosts;
    const before = boosts;

    if (recovery) {
      fatigue -= 28 * recoverMul;
      sharpness += 1 * response.train;
    } else if (inChallenge) {
      if (usedIntensity === "light") {
        fatigue -= 8 * recoverMul;
      } else if (usedIntensity === "intense") {
        fatigue += (alreadyHeavy ? 26 : 18) * response.fatigue * loadMul;
      }
      sharpness += (alreadyHeavy ? -2 : 9) * response.train;
    } else if (session === "challenge") {
      fatigue -= 12 * recoverMul;
      sharpness += 1 * response.train;
    } else if (usedIntensity === "light") {
      fatigue -= 42 * recoverMul;
      sharpness += 1 * response.train;
      boosts = liftFromMix(boosts, plan.mix, usedIntensity, response.train, player.ratings);
      for (const key of ATTRIBUTE_KEYS) {
        if ((boosts[key] ?? 0) > (before?.[key] ?? 0) + VISIBLE_LIFT) lifted.add(key);
      }
    } else if (usedIntensity === "intense") {
      const load = sessionLoad(plan.mix, alreadyHeavy);
      fatigue += load.fatigue * response.fatigue * loadMul;
      sharpness += load.sharpness * response.train;
      boosts = liftFromMix(boosts, plan.mix, usedIntensity, response.train, player.ratings);
      for (const key of ATTRIBUTE_KEYS) {
        if ((boosts[key] ?? 0) > (before?.[key] ?? 0) + VISIBLE_LIFT) lifted.add(key);
      }
    } else {
      const load = sessionLoad(plan.mix, alreadyHeavy);
      fatigue -= 10 * recoverMul;
      sharpness += load.sharpness * response.train;
      boosts = liftFromMix(boosts, plan.mix, usedIntensity, response.train, player.ratings);
      for (const key of ATTRIBUTE_KEYS) {
        if ((boosts[key] ?? 0) > (before?.[key] ?? 0) + VISIBLE_LIFT) lifted.add(key);
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
      form: current.form,
      mood: current.mood,
      boosts,
      injury: current.injury,
    };
    const playerDelta = boostDeltas(before, boosts);
    if (Object.keys(playerDelta).length > 0) deltas[player.name] = playerDelta;
    const playerVisible = visibleBoostDeltas(before, boosts);
    if (Object.keys(playerVisible).length > 0) visibleDeltas[player.name] = playerVisible;
  }

  let lastSheet = sheet;
  if (session === "challenge" && sheet) {
    const teamworked = applyTeamwork(next, sheet, previous, "challenge");
    for (const name of [...sheet.starters, ...sheet.subs]) {
      const extra = boostDeltas(next[name]?.boosts, teamworked.condition[name]?.boosts);
      if (Object.keys(extra).length > 0) {
        deltas[name] = { ...(deltas[name] ?? {}), ...extra };
      }
      const extraVisible = visibleBoostDeltas(next[name]?.boosts, teamworked.condition[name]?.boosts);
      if (Object.keys(extraVisible).length > 0) {
        visibleDeltas[name] = { ...(visibleDeltas[name] ?? {}), ...extraVisible };
      }
    }
    Object.assign(next, teamworked.condition);
    lastSheet = teamworked.lastSheet;
  }

  const label = SESSION_OPTIONS.find((item) => item.value === session)?.title ?? session;
  const liftedText = joinLabels([...lifted]);
  const intensityNote =
    intensity === "intense"
      ? " Intense work lands harder on the legs."
      : intensity === "light"
        ? " Light work puts fitness back into the legs quickly; attributes only tick a little."
        : " Balanced work lets the legs come back a little.";
  const summary =
    overtrained.length > 0
      ? `${label} is done, but ${overtrained.length} player${overtrained.length === 1 ? " is" : "s are"} overtrained. The work is banked, yet match ratings look heavy until fitness recovers.`
      : session === "recovery"
        ? "Recovery week lands. Match fitness is back up, so banked ratings show through again."
        : session === "challenge"
          ? `Challenge match is in the book. Teamwork lifts when the same lads stay in the same positions. Mental attributes did not move.${intensityNote}`
          : liftedText
            ? `${label} session is in the book. ${liftedText.charAt(0).toUpperCase()}${liftedText.slice(1)} are up on the player profiles — open the squad to see the numbers move. Workrate and composure stay as they are.${intensityNote}`
            : `${label} session is in the book. Open the squad to see who took a lift. Workrate and composure stay as they are.${intensityNote}`;

  return { condition: next, overtrained, summary, lastSheet, deltas, visibleDeltas };
}

export function applyWeekSession(options: {
  squad: RatedPlayer[];
  condition: Record<string, PlayerCondition>;
  sheet: TeamSheet;
  lastSheet?: TeamSheet;
  plans: TrainingPlans;
  phase: CalendarPhase;
  preseasonWeek: number;
  sessionsDone: number;
  intensity: TrainingIntensity;
  weekShape: WeekShape;
  requestedSession?: WeekSession;
  seed: number;
  weekKey: string;
  remainingWeeks: number;
  weekDeltas?: Record<string, AttributeBoosts>;
}): {
  condition: Record<string, PlayerCondition>;
  sheet: TeamSheet;
  lastSheet?: TeamSheet;
  sessionsDone: number;
  trainingDue: boolean;
  summary: string;
  recovered: string[];
  freshInjuries: RolledInjury[];
  deltas: Record<string, AttributeBoosts>;
  visibleDeltas: Record<string, AttributeBoosts>;
  weekDeltas: Record<string, AttributeBoosts>;
  weekComplete: boolean;
  session: WeekSession;
} {
  const intensity = options.intensity ?? "balanced";
  const weekShape = options.weekShape ?? "challenge";
  const session = sessionForSlot(options.phase, weekShape, options.sessionsDone, options.requestedSession ?? "mixed");
  let recovered: string[] = [];
  let condition = options.condition;
  if (options.sessionsDone === 0) {
    const ticked = tickInjuries(condition, options.squad);
    condition = ticked.condition;
    recovered = ticked.recovered;
  }
  const trained = applyTraining(
    options.squad,
    condition,
    session,
    options.plans,
    options.sheet,
    options.lastSheet,
    intensity,
  );
  const freshInjuries = rollTrainingInjuries({
    squad: options.squad,
    condition: trained.condition,
    focus: session,
    seed: options.seed,
    weekKey: options.weekKey,
    remainingWeeks: options.remainingWeeks,
    intensity,
  });
  condition = trained.condition;
  for (const rolled of freshInjuries) {
    condition = applyInjury(condition, rolled.name, rolled.injury);
  }
  const sheet = sitInjuredPlayers(options.sheet, options.squad, condition);
  const nextDone = options.sessionsDone + 1;
  const weekComplete = nextDone >= sessionsPerWeek(options.phase);
  const priorWeek = options.sessionsDone === 0 ? {} : (options.weekDeltas ?? {});
  const weekDeltas = mergeBoostMaps(priorWeek, trained.deltas);
  return {
    condition,
    sheet,
    lastSheet: trained.lastSheet ?? options.lastSheet,
    sessionsDone: weekComplete ? 0 : nextDone,
    trainingDue: !weekComplete,
    summary: trained.summary,
    recovered,
    freshInjuries,
    deltas: trained.deltas,
    visibleDeltas: trained.visibleDeltas,
    weekDeltas,
    weekComplete,
    session,
  };
}

type WeekSessionResult = ReturnType<typeof applyWeekSession>;

/** Run every remaining session this week in one pass. */
export function applyFullTrainingWeek(
  options: Parameters<typeof applyWeekSession>[0],
): WeekSessionResult & { sessionsRun: number } {
  let current = { ...options };
  let last = applyWeekSession(current);
  let sessionsRun = 1;
  const recovered = [...last.recovered];
  const freshInjuries = [...last.freshInjuries];
  while (!last.weekComplete && sessionsRun < 6) {
    current = {
      ...current,
      condition: last.condition,
      sheet: last.sheet,
      lastSheet: last.lastSheet,
      sessionsDone: last.sessionsDone,
      weekDeltas: last.weekDeltas,
      weekKey: current.weekKey.replace(/-\d+$/, `-${last.sessionsDone}`),
    };
    last = applyWeekSession(current);
    sessionsRun += 1;
    recovered.push(...last.recovered);
    freshInjuries.push(...last.freshInjuries);
  }
  return { ...last, recovered, freshInjuries, sessionsRun };
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
    const amount = previous?.starters[index] === name ? TEAMWORK_SAME_SLOT : TEAMWORK_STARTER;
    bump(name, amount);
  });
  for (const name of sheet.subs) {
    bump(name, kind === "competitive" && returning.has(name) ? TEAMWORK_BENCH : 0);
  }
  return { condition: next, lastSheet: { starters: [...sheet.starters], subs: [...sheet.subs] } };
}

export function matchFatigueDelta(
  minutes: number,
  tactics: Tactics | undefined,
  position: PositionLine,
  started: boolean,
  age = 27,
  shortForwards = false,
  chaseEffort = 0,
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
  if ((plan.shape === "sweeper" || shortForwards) && (position === "HF" || position === "FF")) {
    gain += 9 * share;
  }
  gain += Math.min(1, Math.max(0, chaseEffort)) * 14 * share;
  gain *= ageResponse(age).fatigue;
  return Math.round(gain);
}

export function applyMatchFatigue(
  condition: Record<string, PlayerCondition>,
  starters: string[],
  subs: string[],
  tactics: Tactics | undefined = undefined,
  squad: RatedPlayer[] = [],
  shortForwards = false,
  chaseEffort = 0,
): Record<string, PlayerCondition> {
  const next = { ...condition };
  const byName = new Map(squad.map((player) => [player.name, player]));
  const bump = (name: string, started: boolean) => {
    const current = cloneCondition(next[name] ?? defaultCondition());
    const position = byName.get(name)?.position ?? "MF";
    const age = byName.get(name)?.age ?? 27;
    const add = matchFatigueDelta(62, tactics, position, started, age, shortForwards, chaseEffort);
    const recover = 4 * ageResponse(age).recover;
    next[name] = {
      fatigue: clampCondition(current.fatigue + add - recover),
      sharpness: clampCondition(current.sharpness + (started ? 3 : 1)),
      form: current.form,
      mood: current.mood,
      boosts: current.boosts,
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
