import { seedChampionship } from "../data/championship";
import { DEFAULT_TACTICS, defaultSheet } from "./players";
import type { Championship, GameSave, NewsItem, Score, Tactics, TeamSheet } from "../types";

const STORAGE_KEY = "champ-manager:game-v1";

export function newSave(clubId: string): GameSave {
  const championship = structuredClone(seedChampionship);
  return {
    version: 1,
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
    const parsed = JSON.parse(raw) as GameSave;
    if (parsed.version !== 1 || !parsed.clubId) return null;
    return parsed;
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
