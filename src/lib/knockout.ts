import type { Championship, GameSave, Match, MatchPeriod, MatchStage, Score, TeamRef } from "../types";
import { scoreTotal, winnerOf } from "./scoring";

export function isKnockoutStage(stage?: MatchStage): boolean {
  return Boolean(stage) && stage !== "group";
}

export function scoresAreLevel(home: Score, away: Score): boolean {
  return scoreTotal(home) === scoreTotal(away);
}

export function knockoutNeedsExtraTime(stage: MatchStage | undefined, home: Score, away: Score): boolean {
  return isKnockoutStage(stage) && scoresAreLevel(home, away);
}

export function periodSwitchesEnds(period: MatchPeriod): boolean {
  return period === "second" || period === "et2";
}

export function periodClock(period: MatchPeriod): { startMinute: number; endMinute: number; periodMinutes: number } {
  switch (period) {
    case "first":
      return { startMinute: 1, endMinute: 31, periodMinutes: 32 };
    case "second":
      return { startMinute: 32, endMinute: 62, periodMinutes: 30 };
    case "et1":
      return { startMinute: 63, endMinute: 72, periodMinutes: 10 };
    case "et2":
      return { startMinute: 73, endMinute: 82, periodMinutes: 10 };
    default:
      return { startMinute: 1, endMinute: 62, periodMinutes: 62 };
  }
}

export function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function knockoutRootId(matchId: string): string {
  return matchId.replace(/-replay(?:-\d+)?$/, "");
}

export function nextReplayId(matches: { id: string }[], parentId: string): string {
  const root = knockoutRootId(parentId);
  const first = `${root}-replay`;
  if (!matches.some((item) => item.id === first)) return first;
  let n = 2;
  while (matches.some((item) => item.id === `${root}-replay-${n}`)) n += 1;
  return `${root}-replay-${n}`;
}

export function replayFixture(
  match: Match,
  homeId: string,
  awayId: string,
  existing: { id: string }[],
): Match {
  const home: TeamRef = { type: "team", teamId: homeId };
  const away: TeamRef = { type: "team", teamId: awayId };
  return {
    id: nextReplayId(existing, match.id),
    stage: match.stage,
    date: addDays(match.date, 7),
    time: match.time,
    venue: match.venue,
    home,
    away,
    homeScore: null,
    awayScore: null,
    replayOf: match.id,
  };
}

export function insertReplay(matches: Match[], replay: Match): Match[] {
  if (matches.some((item) => item.id === replay.id)) return matches;
  let insertAt = matches.length;
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    if (matches[index]?.stage === replay.stage) {
      insertAt = index + 1;
      break;
    }
  }
  const next = [...matches];
  next.splice(insertAt, 0, replay);
  return next;
}

export function replayOf(championship: Championship, matchId: string): Match | undefined {
  return championship.matches.find((item) => item.replayOf === matchId);
}

/** Winner that lets the next knockout round resolve. A draw waits on a replay. */
export function decisiveResult(championship: Championship, match: Match): "home" | "away" | null {
  const result = winnerOf(match);
  if (result === "home" || result === "away") return result;
  if (result === null) return null;
  const replay = replayOf(championship, match.id);
  return replay ? decisiveResult(championship, replay) : null;
}

export function withReplayFixture(save: GameSave, replay: Match): GameSave {
  const extraMatches = insertReplay(save.extraMatches ?? [], replay);
  const matches = save.matches.some((item) => item.id === replay.id)
    ? save.matches
    : [...save.matches, { id: replay.id, homeScore: null, awayScore: null }];
  return { ...save, extraMatches, matches };
}
