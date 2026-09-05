import { seedChampionship } from "../data/championship";
import { DEFAULT_TACTICS, defaultSheet } from "./players";
import type { Championship, GameSave, NewsItem, Score, Tactics, TeamSheet } from "../types";

const STORAGE_KEY = "champ-manager:game-v1";

type LegacyTactics = {
  mentality?: Tactics["mentality"];
  style?: "possession" | "direct";
  pressing?: "low" | "medium" | "high";
  build?: Tactics["build"];
  puckout?: Tactics["puckout"];
  shape?: Tactics["shape"];
};

function isTactics(value: unknown): value is Tactics {
  if (!value || typeof value !== "object") return false;
  const tactics = value as Tactics;
  return (
    (tactics.mentality === "contain" || tactics.mentality === "balanced" || tactics.mentality === "attacking") &&
    (tactics.build === "direct" || tactics.build === "running") &&
    (tactics.puckout === "contest" || tactics.puckout === "short") &&
    (tactics.shape === "sweeper" || tactics.shape === "traditional")
  );
}

export function migrateTactics(raw: unknown): Tactics {
  if (isTactics(raw)) return raw;
  const legacy = (raw ?? {}) as LegacyTactics;
  return {
    mentality:
      legacy.mentality === "contain" || legacy.mentality === "attacking" || legacy.mentality === "balanced"
        ? legacy.mentality
        : DEFAULT_TACTICS.mentality,
    build: legacy.build ?? (legacy.style === "direct" ? "direct" : "running"),
    puckout: legacy.puckout ?? (legacy.pressing === "high" ? "contest" : "short"),
    shape: legacy.shape ?? "traditional",
  };
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
  };
  if (!parsed.clubId || !parsed.sheet || !Array.isArray(parsed.matches)) return null;
  if (parsed.version !== 1 && parsed.version !== 2) return null;
  return {
    version: 2,
    clubId: parsed.clubId,
    seed: typeof parsed.seed === "number" ? parsed.seed : 1,
    tactics: migrateTactics(parsed.tactics),
    sheet: parsed.sheet,
    matches: parsed.matches,
    inbox: Array.isArray(parsed.inbox) ? parsed.inbox : [],
  };
}

export function newSave(clubId: string): GameSave {
  const championship = structuredClone(seedChampionship);
  return {
    version: 2,
    clubId,
    seed: Math.floor(Math.random() * 1_000_000_000),
    tactics: DEFAULT_TACTICS,
    sheet: defaultSheet(clubId),
    matches: championship.matches.map((match) => ({
      id: match.id,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
    })),
    inbox: [],
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
  return { ...save, inbox: [...items, ...save.inbox].slice(0, 40) };
}

export function withTactics(save: GameSave, tactics: Tactics): GameSave {
  return { ...save, tactics };
}

export function withSheet(save: GameSave, sheet: TeamSheet): GameSave {
  return { ...save, sheet };
}
