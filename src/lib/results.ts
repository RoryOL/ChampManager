import type { Championship, Score } from "../types";
import { referenceResults } from "../data/referenceResults";

export function applyResults(
  championship: Championship,
  results: Record<string, { home: Score; away: Score }> = referenceResults,
): Championship {
  return {
    ...championship,
    matches: championship.matches.map((match) => {
      const result = results[match.id];
      if (!result) return match;
      return { ...match, homeScore: result.home, awayScore: result.away };
    }),
  };
}
