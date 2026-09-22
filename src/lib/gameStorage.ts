import { seedChampionship } from "../data/championship";
import { createManagedClub, seedRivals } from "./aiManager";
import { DEFAULT_DIFFICULTY, migrateDifficulty } from "./difficulty";
import { DEFAULT_BALANCE, migrateBalance } from "./balance";
import { DEFAULT_TACTICS, clampStat, defaultSheet, expandSheetToPanel } from "./players";
import { ATTRIBUTE_KEYS, clampDial } from "./attributes";
import { ambitionFor, migrateNewsItem } from "./news";
import { withStartingForm } from "./form";
import { insertReplay } from "./knockout";
import { calendarDate } from "./scoring";
import {
  clampBoost,
  clampFatigue,
  defaultCondition,
  DEFAULT_INTENSITY,
  DEFAULT_WEEK_SHAPE,
  ensureCondition,
  isMatchPrep,
  squadNames,
} from "./training";
import { migrateManMarks } from "./manMarking";
import type {
  AmbitionTarget,
  AttributeBoosts,
  CalendarPhase,
  Championship,
  ClubRuntime,
  Difficulty,
  GameSave,
  CareerBook,
  CareerRatings,
  MatchPrep,
  MatchReport,
  NewsItem,
  PlayerCareer,
  PlayerCondition,
  PlayerGrade,
  PositionFamiliarity,
  PositionLine,
  SquadJoin,
  Score,
  SeasonWrap,
  SquadBalance,
  Tactics,
  TeamSheet,
  TrainingIntensity,
  TrainingPlans,
  WeekShape,
} from "../types";

export const SAVE_VERSION = 15;

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
  puckoutTarget?: string;
  manMarks?: Record<string, string>;
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
      puckoutTarget: raw.puckoutTarget,
      manMarks: migrateManMarks(raw.manMarks),
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
    puckoutTarget: (legacy as { puckoutTarget?: string }).puckoutTarget,
    manMarks: migrateManMarks((legacy as { manMarks?: unknown }).manMarks),
  };
}

function migrateIntensity(raw: unknown): TrainingIntensity {
  return raw === "intense" || raw === "light" || raw === "balanced" ? raw : DEFAULT_INTENSITY;
}

function migrateWeekShape(raw: unknown): WeekShape {
  return raw === "triple" || raw === "challenge" ? raw : DEFAULT_WEEK_SHAPE;
}

function migrateMatchPrep(raw: unknown): MatchPrep | undefined {
  return isMatchPrep(raw) ? raw : undefined;
}

function isSheet(value: unknown): value is TeamSheet {
  if (!value || typeof value !== "object") return false;
  const sheet = value as TeamSheet;
  return Array.isArray(sheet.starters) && Array.isArray(sheet.subs);
}

function migrateClubRuntime(clubId: string, raw: unknown, seed: number): ClubRuntime {
  const created = createManagedClub(clubId, seed);
  if (!raw || typeof raw !== "object") return created;
  const parsed = raw as Partial<ClubRuntime>;
  const names = squadNames(clubId, seed);
  return {
    tactics: parsed.tactics ? migrateTactics(parsed.tactics) : created.tactics,
    sheet: isSheet(parsed.sheet) ? parsed.sheet : created.sheet,
    condition: withStartingForm(
      clampConditionBoosts(ensureCondition(names, parsed.condition ?? created.condition, defaultCondition())),
      names,
      seed,
    ),
    inbox: Array.isArray(parsed.inbox) ? parsed.inbox : [],
    trainingDue: typeof parsed.trainingDue === "boolean" ? parsed.trainingDue : created.trainingDue,
    plans: parsed.plans ?? {},
    lastSheet: isSheet(parsed.lastSheet) ? parsed.lastSheet : created.lastSheet,
    intensity: migrateIntensity(parsed.intensity),
    weekShape: migrateWeekShape(parsed.weekShape),
    sessionsDone:
      typeof parsed.sessionsDone === "number" ? Math.max(0, Math.min(3, Math.round(parsed.sessionsDone))) : 0,
    trainingDeltas: parsed.trainingDeltas ?? {},
    weekDeltas: parsed.weekDeltas ?? {},
    nextMatchPrep: migrateMatchPrep(parsed.nextMatchPrep),
  };
}

function migrateRivals(clubId: string, seed: number, raw: unknown): Record<string, ClubRuntime> {
  const parsed = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const rivals: Record<string, ClubRuntime> = {};
  for (const team of seedChampionship.teams) {
    if (team.id === clubId) continue;
    rivals[team.id] = migrateClubRuntime(team.id, parsed[team.id], seed);
  }
  return rivals;
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
    rivals?: unknown;
    difficulty?: unknown;
    balance?: unknown;
    nextMatchPrep?: unknown;
    extraMatches?: unknown;
    seasonWrap?: unknown;
    year?: unknown;
    defendingChampionId?: unknown;
    careers?: unknown;
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
    parsed.version !== 9 &&
    parsed.version !== 10 &&
    parsed.version !== 11 &&
    parsed.version !== 12 &&
    parsed.version !== 13 &&
    parsed.version !== 14 &&
    parsed.version !== 15
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
    version: SAVE_VERSION,
    clubId: parsed.clubId,
    seed,
    tactics: migrateTactics(parsed.tactics),
    sheet: expandSheetToPanel(parsed.clubId, parsed.sheet, seed),
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
    lastSheet: parsed.lastSheet ? expandSheetToPanel(parsed.clubId, parsed.lastSheet, seed) : parsed.lastSheet,
    intensity: migrateIntensity(parsed.intensity),
    weekShape: migrateWeekShape(parsed.weekShape),
    sessionsDone: typeof parsed.sessionsDone === "number" ? Math.max(0, Math.min(3, Math.round(parsed.sessionsDone))) : 0,
    trainingDeltas,
    weekDeltas,
    rivals: migrateRivals(parsed.clubId, seed, parsed.rivals),
    difficulty: migrateDifficulty(parsed.difficulty),
    balance: migrateBalance(parsed.balance),
    nextMatchPrep: migrateMatchPrep(parsed.nextMatchPrep),
    extraMatches: Array.isArray(parsed.extraMatches) ? parsed.extraMatches : [],
    seasonWrap: migrateSeasonWrap(parsed.seasonWrap),
    year: typeof parsed.year === "number" && Number.isFinite(parsed.year) ? Math.round(parsed.year) : undefined,
    defendingChampionId:
      typeof parsed.defendingChampionId === "string" &&
      seedChampionship.teams.some((team) => team.id === parsed.defendingChampionId)
        ? parsed.defendingChampionId
        : undefined,
    careers: migrateCareers(parsed.careers),
  };
}

function migrateBank(raw: unknown): PlayerCareer["bank"] {
  if (!raw || typeof raw !== "object") return undefined;
  const bank: Partial<CareerRatings> = {};
  for (const key of ATTRIBUTE_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value !== "number" || !Number.isFinite(value) || value === 0) continue;
    bank[key] = Math.max(-0.99, Math.min(0.99, Math.round(value * 1000) / 1000));
  }
  return Object.keys(bank).length > 0 ? bank : undefined;
}

function migrateJoined(raw: unknown): SquadJoin | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const parsed = raw as { number?: unknown; position?: unknown; grade?: unknown; familiarity?: unknown };
  const lines: PositionLine[] = ["GK", "FB", "HB", "MF", "HF", "FF"];
  if (!lines.includes(parsed.position as PositionLine)) return undefined;
  const grades: PlayerGrade[] = ["A", "B", "C", "D"];
  if (!grades.includes(parsed.grade as PlayerGrade)) return undefined;
  if (typeof parsed.number !== "number" || !Number.isFinite(parsed.number)) return undefined;
  if (!parsed.familiarity || typeof parsed.familiarity !== "object") return undefined;
  const familiarity = {} as PositionFamiliarity;
  for (const line of lines) {
    const value = (parsed.familiarity as Record<string, unknown>)[line];
    if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
    familiarity[line] = clampStat(value);
  }
  return {
    number: Math.max(1, Math.round(parsed.number)),
    position: parsed.position as PositionLine,
    grade: parsed.grade as PlayerGrade,
    familiarity,
  };
}

function migrateCareers(raw: unknown): CareerBook | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const book: CareerBook = {};
  for (const [clubId, squad] of Object.entries(raw as Record<string, unknown>)) {
    if (!seedChampionship.teams.some((team) => team.id === clubId)) continue;
    if (!squad || typeof squad !== "object") continue;
    const players: Record<string, PlayerCareer> = {};
    for (const [name, career] of Object.entries(squad as Record<string, unknown>)) {
      if (!career || typeof career !== "object") continue;
      const parsed = career as { age?: unknown; ratings?: unknown; bank?: unknown; joined?: unknown; retired?: unknown };
      if (typeof parsed.age !== "number" || !Number.isFinite(parsed.age)) continue;
      if (!parsed.ratings || typeof parsed.ratings !== "object") continue;
      const ratings = {} as CareerRatings;
      let count = 0;
      for (const key of ATTRIBUTE_KEYS) {
        const value = (parsed.ratings as Record<string, unknown>)[key];
        if (typeof value !== "number" || !Number.isFinite(value)) continue;
        ratings[key] = clampStat(value);
        count += 1;
      }
      if (count !== ATTRIBUTE_KEYS.length) continue;
      const joined = migrateJoined(parsed.joined);
      players[name] = {
        age: Math.round(parsed.age),
        ratings,
        bank: migrateBank(parsed.bank),
        ...(joined ? { joined } : {}),
        ...(parsed.retired === true ? { retired: true } : {}),
      };
    }
    if (Object.keys(players).length > 0) book[clubId] = players;
  }
  return Object.keys(book).length > 0 ? book : undefined;
}

function migrateSeasonWrap(raw: unknown): SeasonWrap | undefined {
  return raw === "offer" || raw === "done" ? raw : undefined;
}

function clampConditionBoosts(condition: Record<string, PlayerCondition>): Record<string, PlayerCondition> {
  const next: Record<string, PlayerCondition> = {};
  for (const [name, current] of Object.entries(condition)) {
    const fatigue = clampFatigue(current.fatigue);
    if (!current.boosts) {
      next[name] = fatigue === current.fatigue ? current : { ...current, fatigue };
      continue;
    }
    const boosts: AttributeBoosts = {};
    for (const key of ATTRIBUTE_KEYS) {
      const value = current.boosts[key];
      if (typeof value === "number" && value !== 0) boosts[key] = clampBoost(value);
    }
    next[name] = { ...current, fatigue, boosts };
  }
  return next;
}

export function newSave(
  clubId: string,
  difficulty: Difficulty = DEFAULT_DIFFICULTY,
  balance: SquadBalance = DEFAULT_BALANCE,
): GameSave {
  const championship = structuredClone(seedChampionship);
  const seed = Math.floor(Math.random() * 1_000_000_000);
  const names = squadNames(clubId, seed);
  return {
    version: SAVE_VERSION,
    clubId,
    seed,
    difficulty: migrateDifficulty(difficulty),
    balance: migrateBalance(balance),
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
    rivals: seedRivals(clubId, seed, migrateBalance(balance)),
    extraMatches: [],
  };
}

export function championshipFromSave(save: GameSave): Championship {
  const championship = structuredClone(seedChampionship);
  const year = typeof save.year === "number" ? save.year : championship.year;
  championship.year = year;
  if (
    save.defendingChampionId &&
    championship.teams.some((team) => team.id === save.defendingChampionId)
  ) {
    championship.defendingChampionId = save.defendingChampionId;
  }
  const byId = new Map(save.matches.map((match) => [match.id, match]));
  championship.matches = championship.matches.map((match) => {
    const saved = byId.get(match.id);
    return {
      ...match,
      date: calendarDate(match.date, year),
      homeScore: saved ? saved.homeScore : match.homeScore,
      awayScore: saved ? saved.awayScore : match.awayScore,
    };
  });
  for (const extra of save.extraMatches ?? []) {
    if (championship.matches.some((item) => item.id === extra.id)) continue;
    const saved = byId.get(extra.id);
    championship.matches = insertReplay(championship.matches, {
      ...extra,
      homeScore: saved?.homeScore ?? extra.homeScore,
      awayScore: saved?.awayScore ?? extra.awayScore,
    });
  }
  return championship;
}

export function writeScores(save: GameSave, updates: { id: string; homeScore: Score; awayScore: Score }[]): GameSave {
  const byId = new Map(updates.map((item) => [item.id, item]));
  const matches = save.matches.map((match) => {
    const update = byId.get(match.id);
    if (!update) return match;
    return { ...match, homeScore: update.homeScore, awayScore: update.awayScore };
  });
  for (const update of updates) {
    if (matches.some((item) => item.id === update.id)) continue;
    matches.push({ id: update.id, homeScore: update.homeScore, awayScore: update.awayScore });
  }
  return { ...save, matches };
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
