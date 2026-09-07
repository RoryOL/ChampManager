import { seedChampionship } from "../data/championship";
import { DEFAULT_TACTICS, defaultSheet } from "./players";
import { ATTRIBUTE_KEYS, clampDial } from "./attributes";
import { ambitionFor, migrateNewsItem } from "./news";
import { withStartingForm } from "./form";
import {
  clampBoost,
  defaultCondition,
  DEFAULT_INTENSITY,
  DEFAULT_WEEK_SHAPE,
  ensureCondition,
  squadNames,
} from "./training";
import type {
  AmbitionTarget,
  AttributeBoosts,
  CalendarPhase,
  Championship,
  GameSave,
  MatchReport,
  NewsItem,
  PlayerCondition,
  Score,
  Tactics,
  TeamSheet,
  TrainingIntensity,
  TrainingPlans,
  WeekShape,
} from "../types";

const STORAGE_KEY = "champ-manager:game-v1";

type LegacyTactics = {
  mentality?: Tactics["mentality"];
  style?: "possession" | "direct";
  pressing?: "low" | "medium" | "high";
  build?: Tactics["build"] | "direct" | "running";
  puckout?: Tactics["puckout"] | "contest" | "short";
  aggression?: number;
  pressure?: number;
  shape?: Tactics["shape"];
  longFreeTaker?: string;
  shortFreeTaker?: string;
  sidelineTaker?: string;
};

function isTactics(value: unknown): value is Tactics {
  if (!value || typeof value !== "object") return false;
  const tactics = value as Tactics;
  return (
    (tactics.mentality === "contain" || tactics.mentality === "balanced" || tactics.mentality === "attacking") &&
    typeof tactics.build === "number" &&
    typeof tactics.puckout === "number" &&
    (tactics.shape === "sweeper" || tactics.shape === "traditional")
  );
}

export function migrateTactics(raw: unknown): Tactics {
  if (isTactics(raw)) {
    const aggression =
      typeof (raw as Tactics).aggression === "number" ? (raw as Tactics).aggression : DEFAULT_TACTICS.aggression;
    const pressure =
      typeof (raw as Tactics).pressure === "number" ? (raw as Tactics).pressure : DEFAULT_TACTICS.pressure;
    const shooting =
      typeof (raw as Tactics).shooting === "number" ? (raw as Tactics).shooting : DEFAULT_TACTICS.shooting;
    return {
      ...raw,
      build: clampDial(raw.build),
      puckout: clampDial(raw.puckout),
      aggression: clampDial(aggression),
      pressure: clampDial(pressure),
      shooting: clampDial(shooting),
      longFreeTaker: raw.longFreeTaker,
      shortFreeTaker: raw.shortFreeTaker,
      sidelineTaker: raw.sidelineTaker,
    };
  }
  const legacy = (raw ?? {}) as LegacyTactics;
  const build =
    typeof legacy.build === "number"
      ? legacy.build
      : legacy.build === "direct" || legacy.style === "direct"
        ? 80
        : 28;
  const puckout =
    typeof legacy.puckout === "number"
      ? legacy.puckout
      : legacy.puckout === "contest" || legacy.pressing === "high"
        ? 78
        : 24;
  const pressure =
    typeof legacy.pressure === "number" ? legacy.pressure : legacy.pressing === "high" ? 78 : legacy.pressing === "low" ? 22 : DEFAULT_TACTICS.pressure;
  return {
    mentality:
      legacy.mentality === "contain" || legacy.mentality === "attacking" || legacy.mentality === "balanced"
        ? legacy.mentality
        : DEFAULT_TACTICS.mentality,
    build: clampDial(build),
    puckout: clampDial(puckout),
    aggression: clampDial(typeof legacy.aggression === "number" ? legacy.aggression : DEFAULT_TACTICS.aggression),
    pressure: clampDial(pressure),
    shooting: clampDial(
      typeof (legacy as { shooting?: number }).shooting === "number"
        ? (legacy as { shooting?: number }).shooting ?? DEFAULT_TACTICS.shooting
        : DEFAULT_TACTICS.shooting,
    ),
    shape: legacy.shape === "sweeper" || legacy.shape === "traditional" ? legacy.shape : "traditional",
    longFreeTaker: legacy.longFreeTaker,
    shortFreeTaker: legacy.shortFreeTaker,
    sidelineTaker: legacy.sidelineTaker,
  };
}

function migrateIntensity(raw: unknown): TrainingIntensity {
  return raw === "intense" || raw === "light" || raw === "balanced" ? raw : DEFAULT_INTENSITY;
}

function migrateWeekShape(raw: unknown): WeekShape {
  return raw === "triple" || raw === "challenge" ? raw : DEFAULT_WEEK_SHAPE;
}

export function migrateSave(raw: unknown): GameSave | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as {
    version?: number;
    clubId?: string;
    seed?: number;
    tactics?: unknown;
    sheet?: GameSave["sheet"];
    matches?: GameSave["matches"];
    inbox?: GameSave["inbox"];
    phase?: CalendarPhase;
    preseasonWeek?: number;
    condition?: Record<string, PlayerCondition>;
    trainingDue?: boolean;
    reports?: Record<string, MatchReport>;
    ambition?: AmbitionTarget;
    plans?: TrainingPlans;
    lastSheet?: TeamSheet;
    intensity?: unknown;
    weekShape?: unknown;
    sessionsDone?: unknown;
    trainingDeltas?: unknown;
    weekDeltas?: unknown;
  };
  if (!parsed.clubId || !parsed.sheet || !Array.isArray(parsed.matches)) return null;
  if (
    parsed.version !== 1 &&
    parsed.version !== 2 &&
    parsed.version !== 3 &&
    parsed.version !== 4 &&
    parsed.version !== 5 &&
    parsed.version !== 6 &&
    parsed.version !== 7 &&
    parsed.version !== 8 &&
    parsed.version !== 9
  ) {
    return null;
  }
  const seed = typeof parsed.seed === "number" ? parsed.seed : 1;
  const names = squadNames(parsed.clubId, seed);
  const returning = parsed.version === 1 || parsed.version === 2;
  const inbox = Array.isArray(parsed.inbox)
    ? parsed.inbox.map(migrateNewsItem).filter((item): item is NewsItem => Boolean(item))
    : [];
  const ambition: AmbitionTarget =
    parsed.ambition === "canon" ||
    parsed.ambition === "final" ||
    parsed.ambition === "semi" ||
    parsed.ambition === "quarter" ||
    parsed.ambition === "group"
      ? parsed.ambition
      : ambitionFor(parsed.clubId).target;
  const trainingDeltas =
    parsed.trainingDeltas && typeof parsed.trainingDeltas === "object"
      ? (parsed.trainingDeltas as Record<string, AttributeBoosts>)
      : {};
  const weekDeltas =
    parsed.weekDeltas && typeof parsed.weekDeltas === "object"
      ? (parsed.weekDeltas as Record<string, AttributeBoosts>)
      : {};
  return {
    version: 9,
    clubId: parsed.clubId,
    seed,
    tactics: migrateTactics(parsed.tactics),
    sheet: parsed.sheet,
    matches: parsed.matches,
    inbox,
    phase: parsed.phase === "preseason" || parsed.phase === "season" ? parsed.phase : returning ? "season" : "preseason",
    preseasonWeek:
      typeof parsed.preseasonWeek === "number"
        ? parsed.preseasonWeek
        : returning
          ? 7
          : 1,
    condition: withStartingForm(
      clampConditionBoosts(
        ensureCondition(
          names,
          parsed.condition ?? {},
          returning ? { fatigue: 28, sharpness: 58 } : defaultCondition(),
        ),
      ),
      names,
      seed,
    ),
    trainingDue: typeof parsed.trainingDue === "boolean" ? parsed.trainingDue : !returning,
    reports: parsed.reports ?? {},
    ambition,
    plans: parsed.plans ?? {},
    lastSheet: parsed.lastSheet,
    intensity: migrateIntensity(parsed.intensity),
    weekShape: migrateWeekShape(parsed.weekShape),
    sessionsDone: typeof parsed.sessionsDone === "number" ? Math.max(0, Math.min(3, Math.round(parsed.sessionsDone))) : 0,
    trainingDeltas,
    weekDeltas,
  };
}

function clampConditionBoosts(condition: Record<string, PlayerCondition>): Record<string, PlayerCondition> {
  const next: Record<string, PlayerCondition> = {};
  for (const [name, current] of Object.entries(condition)) {
    if (!current.boosts) {
      next[name] = current;
      continue;
    }
    const boosts: AttributeBoosts = {};
    for (const key of ATTRIBUTE_KEYS) {
      const value = current.boosts[key];
      if (typeof value === "number" && value !== 0) boosts[key] = clampBoost(value);
    }
    next[name] = { ...current, boosts };
  }
  return next;
}

export function newSave(clubId: string): GameSave {
  const championship = structuredClone(seedChampionship);
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const names = squadNames(clubId, seed);
  return {
    version: 9,
    clubId,
    seed,
    tactics: DEFAULT_TACTICS,
    sheet: defaultSheet(clubId),
    matches: championship.matches.map((match) => ({
      id: match.id,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
    })),
    inbox: [],
    phase: "preseason",
    preseasonWeek: 1,
    condition: withStartingForm(ensureCondition(names, {}, defaultCondition()), names, seed),
    trainingDue: true,
    reports: {},
    ambition: ambitionFor(clubId).target,
    plans: {},
    intensity: DEFAULT_INTENSITY,
    weekShape: DEFAULT_WEEK_SHAPE,
    sessionsDone: 0,
    trainingDeltas: {},
    weekDeltas: {},
  };
}

export function championshipFromSave(save: GameSave): Championship {
  const championship = structuredClone(seedChampionship);
  const byId = new Map(save.matches.map((match) => [match.id, match]));
  championship.matches = championship.matches.map((match) => {
    const saved = byId.get(match.id);
    if (!saved) return match;
    return { ...match, homeScore: saved.homeScore, awayScore: saved.awayScore };
  });
  return championship;
}

export function writeScores(save: GameSave, updates: { id: string; homeScore: Score; awayScore: Score }[]): GameSave {
  const byId = new Map(updates.map((item) => [item.id, item]));
  return {
    ...save,
    matches: save.matches.map((match) => {
      const update = byId.get(match.id);
      if (!update) return match;
      return { ...match, homeScore: update.homeScore, awayScore: update.awayScore };
    }),
  };
}

export function loadSave(): GameSave | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return migrateSave(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function persistSave(save: GameSave): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
}

export function clearSave(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function withInbox(save: GameSave, items: NewsItem[]): GameSave {
  return { ...save, inbox: [...items, ...save.inbox].slice(0, 80) };
}

export function withTactics(save: GameSave, tactics: Tactics): GameSave {
  return { ...save, tactics };
}

export function withSheet(save: GameSave, sheet: TeamSheet): GameSave {
  return { ...save, sheet };
}

export function withCondition(save: GameSave, condition: Record<string, PlayerCondition>): GameSave {
  return { ...save, condition };
}

export function withPlans(save: GameSave, plans: TrainingPlans): GameSave {
  return { ...save, plans };
}

export function withTrainingPrefs(
  save: GameSave,
  prefs: Partial<Pick<GameSave, "intensity" | "weekShape" | "plans">>,
): GameSave {
  return { ...save, ...prefs };
}
