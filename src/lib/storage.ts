import { seedChampionship } from "../data/championship";
import type { Championship, Match, Score } from "../types";

const STORAGE_KEY = "champ-manager:clare-shc-2026";

function cloneChampionship(data: Championship): Championship {
  return structuredClone(data);
}

export function loadChampionship(): Championship {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneChampionship(seedChampionship);
    const parsed = JSON.parse(raw) as { matches?: Match[] };
    const seeded = cloneChampionship(seedChampionship);
    if (!Array.isArray(parsed.matches)) return seeded;

    const byId = new Map(parsed.matches.map((match) => [match.id, match]));
    seeded.matches = seeded.matches.map((match) => {
      const saved = byId.get(match.id);
      if (!saved) return match;
      return {
        ...match,
        homeScore: saved.homeScore ?? null,
        awayScore: saved.awayScore ?? null,
      };
    });
    return seeded;
  } catch {
    return cloneChampionship(seedChampionship);
  }
}

export function saveChampionship(championship: Championship): void {
  const payload = {
    matches: championship.matches.map((match) => ({
      id: match.id,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
    })),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function updateMatchScore(
  championship: Championship,
  matchId: string,
  homeScore: Score | null,
  awayScore: Score | null,
): Championship {
  return {
    ...championship,
    matches: championship.matches.map((match) =>
      match.id === matchId ? { ...match, homeScore, awayScore } : match,
    ),
  };
}

export function resetChampionship(): Championship {
  localStorage.removeItem(STORAGE_KEY);
  return cloneChampionship(seedChampionship);
}
