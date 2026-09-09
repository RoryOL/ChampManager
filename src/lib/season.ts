import type { Championship, Match, SeasonWrap } from "../types";
import { insertReplay, replayFixture, decisiveResult, replayOf } from "./knockout";
import { resolveMatchSides } from "./resolve";
import { matchPlayed } from "./scoring";
import { seedChampionship } from "../data/championship";

export function championshipWinnerId(championship: Championship): string | null {
  const final = championship.matches.find((item) => item.id === "final" && !item.replayOf);
  if (!final) return null;
  const result = decisiveResult(championship, final);
  if (!result) return null;
  const sides = resolveMatchSides(championship, final);
  return result === "home" ? sides.homeId : result === "away" ? sides.awayId : null;
}

/** The county final that actually decided the Canon, including a replay if one was needed. */
export function championshipDecidingMatch(championship: Championship): Match | undefined {
  const final = championship.matches.find((item) => item.id === "final" && !item.replayOf);
  if (!final) return undefined;
  let current = final;
  let replay = replayOf(championship, current.id);
  while (replay && matchPlayed(replay)) {
    current = replay;
    replay = replayOf(championship, current.id);
  }
  return matchPlayed(current) ? current : undefined;
}

export function seasonFinaleStep(championId: string | null, wrap?: SeasonWrap): "ceremony" | "offer" | "done" | null {
  if (!championId) return null;
  if (wrap === "done") return "done";
  if (wrap === "offer") return "offer";
  return "ceremony";
}

export function championshipWithChampion(
  winnerId: string,
  runnerUpId: string,
  options?: { replay?: boolean },
): Championship {
  const championship = structuredClone(seedChampionship);
  const final = championship.matches.find((item) => item.id === "final");
  if (!final) return championship;
  final.home = { type: "team", teamId: winnerId };
  final.away = { type: "team", teamId: runnerUpId };
  if (!options?.replay) {
    final.homeScore = { goals: 2, points: 16 };
    final.awayScore = { goals: 1, points: 12 };
    return championship;
  }
  final.homeScore = { goals: 1, points: 15 };
  final.awayScore = { goals: 0, points: 18 };
  const replay = replayFixture(final, winnerId, runnerUpId, championship.matches);
  championship.matches = insertReplay(championship.matches, {
    ...replay,
    homeScore: { goals: 1, points: 19 },
    awayScore: { goals: 1, points: 14 },
  });
  return championship;
}
