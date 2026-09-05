import { useCallback, useState } from "react";
import {
  loadChampionship,
  resetChampionship,
  saveChampionship,
  updateMatchScore,
} from "../lib/storage";
import type { Championship, Score } from "../types";

export function useChampionship() {
  const [championship, setChampionship] = useState<Championship>(() => loadChampionship());

  const recordScore = useCallback(
    (matchId: string, homeScore: Score | null, awayScore: Score | null) => {
      setChampionship((current) => {
        const next = updateMatchScore(current, matchId, homeScore, awayScore);
        saveChampionship(next);
        return next;
      });
    },
    [],
  );

  const reset = useCallback(() => {
    setChampionship(resetChampionship());
  }, []);

  return { championship, recordScore, reset };
}
