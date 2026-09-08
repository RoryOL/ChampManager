import type { MatchEvent, TeamSheet } from "../types";

export const MATCH_SUB_LIMIT = 5;

export function isSubstitutionSwap(sheet: TeamSheet, first: string, second: string): boolean {
  return sheet.starters.includes(first) !== sheet.starters.includes(second);
}

export function substitutionCount(events: MatchEvent[], teamId: string): number {
  return events.filter((event) => event.kind === "sub" && event.teamId === teamId).length;
}

export function tacticalSubCount(
  opening: TeamSheet,
  next: TeamSheet,
  events: MatchEvent[],
  teamId: string,
): number {
  const injured = new Set(
    events.filter((event) => event.kind === "injury" && event.teamId === teamId).map((event) => event.playerName),
  );
  const nextStarters = new Set(next.starters);
  return opening.starters.filter((name) => !nextStarters.has(name) && !injured.has(name)).length;
}

export function remainingMatchSubs(
  events: MatchEvent[],
  teamId: string,
  opening: TeamSheet,
  next: TeamSheet = opening,
): number {
  const used = substitutionCount(events, teamId) + tacticalSubCount(opening, next, events, teamId);
  return Math.max(0, MATCH_SUB_LIMIT - used);
}
