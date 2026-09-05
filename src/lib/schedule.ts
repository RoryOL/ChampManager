import type { Championship, Match } from "../types";
import { matchPlayed } from "./scoring";
import { resolveMatchSides } from "./resolve";

export type MatchBatch = {
  label: string;
  matches: Match[];
  userMatch: Match | null;
};

export function nextBatch(championship: Championship, clubId: string): MatchBatch | null {
  const remaining = championship.matches.filter((match) => !matchPlayed(match));
  if (remaining.length === 0) return null;

  const userMatch =
    remaining.find((match) => {
      const { homeId, awayId } = resolveMatchSides(championship, match);
      return homeId === clubId || awayId === clubId;
    }) ?? null;

  const anchor = userMatch ?? remaining[0];
  const matches = remaining.filter((match) => sameBatch(anchor, match));
  return { label: batchLabel(anchor), matches, userMatch };
}

function sameBatch(anchor: Match, match: Match): boolean {
  if (anchor.stage === "group") {
    return match.stage === "group" && match.round === anchor.round;
  }
  return match.stage === anchor.stage;
}

function batchLabel(match: Match): string {
  if (match.stage === "group") return `Round ${match.round}`;
  if (match.stage === "quarter-final") return "Quarter-finals";
  if (match.stage === "semi-final") return "Semi-finals";
  if (match.stage === "final") return "County final";
  if (match.stage === "relegation-semi") return "Relegation semi-finals";
  return "Relegation final";
}

export function seasonComplete(championship: Championship): boolean {
  return championship.matches.every(matchPlayed);
}
