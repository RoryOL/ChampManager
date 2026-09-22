import { seedChampionship } from "../data/championship";
import type {
  CareerBook,
  CareerRatings,
  DevelopmentLog,
  GameSave,
  PositionLine,
  RatedPlayer,
  RatingSnapshot,
  SquadBalance,
} from "../types";
import { ATTRIBUTE_KEYS, type AttributeKey } from "./attributes";
import { ratedSquad } from "./players";

/** First championship on a new game. Later seasons are stored beside it. */
export const OPENING_YEAR = seedChampionship.year;

export type StatChange = {
  key: AttributeKey;
  start: number;
  now: number;
  delta: number;
};

/** One player's natural card from the first recorded season to the current one. */
export type PlayerArc = {
  name: string;
  position: PositionLine;
  joined: boolean;
  history: RatingSnapshot[];
  start: RatingSnapshot;
  current: RatingSnapshot;
  overallDelta: number;
  stats: StatChange[];
};

type LogSource = {
  clubId: string;
  seed: number;
  balance?: SquadBalance;
  year?: number;
  careers?: CareerBook;
  development?: DevelopmentLog;
};

export function snapshotPlayer(player: RatedPlayer, year: number): RatingSnapshot {
  const ratings = {} as CareerRatings;
  for (const key of ATTRIBUTE_KEYS) ratings[key] = player.ratings[key];
  return {
    year,
    age: player.age,
    overall: player.ratings.overall,
    ratings,
  };
}

/** Add this season's natural card. A second write for the same year replaces that season. */
export function appendClubSeason(
  log: DevelopmentLog | undefined,
  clubId: string,
  squad: RatedPlayer[],
  year: number,
): DevelopmentLog {
  const prior = log?.[clubId] ?? {};
  const players: Record<string, RatingSnapshot[]> = { ...prior };
  for (const player of squad) {
    const snap = snapshotPlayer(player, year);
    const history = prior[player.name] ?? [];
    const last = history[history.length - 1];
    players[player.name] = last?.year === year ? [...history.slice(0, -1), snap] : [...history, snap];
  }
  return { ...(log ?? {}), [clubId]: players };
}

export function openingDevelopment(
  clubId: string,
  seed: number,
  balance?: SquadBalance,
  year = OPENING_YEAR,
): DevelopmentLog {
  return appendClubSeason(undefined, clubId, ratedSquad(clubId, { seed, balance }), year);
}

/**
 * Saves from before this screen have no log. Original players get the generated
 * card at the first season and the carried card at the current year. Recruits
 * only have the current card.
 */
export function backfillDevelopment(source: LogSource): DevelopmentLog {
  const opening = openingDevelopment(source.clubId, source.seed, source.balance, OPENING_YEAR);
  const currentYear = source.year ?? (source.careers ? OPENING_YEAR + 1 : OPENING_YEAR);
  if (!source.careers || currentYear === OPENING_YEAR) return opening;
  const current = ratedSquad(source.clubId, {
    seed: source.seed,
    balance: source.balance,
    careers: source.careers,
  });
  return appendClubSeason(opening, source.clubId, current, currentYear);
}

function migrateSnapshot(raw: unknown): RatingSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const parsed = raw as { year?: unknown; age?: unknown; overall?: unknown; ratings?: unknown };
  if (typeof parsed.year !== "number" || !Number.isFinite(parsed.year)) return null;
  if (typeof parsed.age !== "number" || !Number.isFinite(parsed.age)) return null;
  if (typeof parsed.overall !== "number" || !Number.isFinite(parsed.overall)) return null;
  if (!parsed.ratings || typeof parsed.ratings !== "object") return null;
  const ratings = {} as CareerRatings;
  for (const key of ATTRIBUTE_KEYS) {
    const value = (parsed.ratings as Record<string, unknown>)[key];
    if (typeof value !== "number" || !Number.isFinite(value)) return null;
    ratings[key] = Math.max(1, Math.min(20, Math.round(value)));
  }
  return {
    year: Math.round(parsed.year),
    age: Math.round(parsed.age),
    overall: Math.max(1, Math.min(20, Math.round(parsed.overall))),
    ratings,
  };
}

export function migrateDevelopment(raw: unknown): DevelopmentLog | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const log: DevelopmentLog = {};
  for (const [clubId, squad] of Object.entries(raw as Record<string, unknown>)) {
    if (!seedChampionship.teams.some((team) => team.id === clubId)) continue;
    if (!squad || typeof squad !== "object") continue;
    const players: Record<string, RatingSnapshot[]> = {};
    for (const [name, history] of Object.entries(squad as Record<string, unknown>)) {
      if (!Array.isArray(history)) continue;
      const snaps = history.map(migrateSnapshot).filter((snap): snap is RatingSnapshot => Boolean(snap));
      snaps.sort((a, b) => a.year - b.year);
      const deduped: RatingSnapshot[] = [];
      for (const snap of snaps) {
        if (deduped.length > 0 && deduped[deduped.length - 1]!.year === snap.year) deduped[deduped.length - 1] = snap;
        else deduped.push(snap);
      }
      if (deduped.length > 0) players[name] = deduped;
    }
    if (Object.keys(players).length > 0) log[clubId] = players;
  }
  return Object.keys(log).length > 0 ? log : undefined;
}

export function seasonYear(save: Pick<GameSave, "year">): number {
  return save.year ?? OPENING_YEAR;
}

function withLiveCard(history: RatingSnapshot[], player: RatedPlayer, year: number): RatingSnapshot[] {
  const live = snapshotPlayer(player, year);
  if (history.length === 0) return [live];
  const last = history[history.length - 1]!;
  if (last.year === year) return [...history.slice(0, -1), live];
  if (last.year < year) return [...history, live];
  return history;
}

export function developmentRows(save: GameSave, clubId = save.clubId): PlayerArc[] {
  const stored = save.development?.[clubId];
  const log = stored ? save.development! : backfillDevelopment(save);
  const year = seasonYear(save);
  const squad = ratedSquad(clubId, save);
  return squad.map((player) => {
    const history = withLiveCard(log[clubId]?.[player.name] ?? [], player, year);
    const start = history[0]!;
    const current = history[history.length - 1]!;
    const joined = Boolean(save.careers?.[clubId]?.[player.name]?.joined) || start.year > OPENING_YEAR;
    const stats = ATTRIBUTE_KEYS.map((key) => {
      const from = start.ratings[key];
      const now = current.ratings[key];
      return { key, start: from, now, delta: now - from };
    });
    return {
      name: player.name,
      position: player.position,
      joined,
      history,
      start,
      current,
      overallDelta: current.overall - start.overall,
      stats,
    };
  });
}

export function playerArc(save: GameSave, name: string, clubId = save.clubId): PlayerArc | undefined {
  return developmentRows(save, clubId).find((row) => row.name === name);
}

export function changedStats(arc: PlayerArc): StatChange[] {
  return arc.stats
    .filter((stat) => stat.delta !== 0)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || a.key.localeCompare(b.key));
}
