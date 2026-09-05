import type { GroupId, Match, StandingRow, TeamStats } from "../types";
import { matchPlayed, scoreTotal } from "./scoring";

function emptyStats(teamId: string): TeamStats {
  return {
    teamId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    scored: 0,
    conceded: 0,
    points: 0,
  };
}

function applyMatch(table: Map<string, TeamStats>, match: Match): void {
  if (match.home.type !== "team" || match.away.type !== "team") return;
  if (!match.homeScore || !match.awayScore) return;

  const home = table.get(match.home.teamId);
  const away = table.get(match.away.teamId);
  if (!home || !away) return;

  const homeTotal = scoreTotal(match.homeScore);
  const awayTotal = scoreTotal(match.awayScore);

  home.played += 1;
  away.played += 1;
  home.scored += homeTotal;
  home.conceded += awayTotal;
  away.scored += awayTotal;
  away.conceded += homeTotal;

  if (homeTotal > awayTotal) {
    home.won += 1;
    home.points += 2;
    away.lost += 1;
  } else if (awayTotal > homeTotal) {
    away.won += 1;
    away.points += 2;
    home.lost += 1;
  } else {
    home.drawn += 1;
    away.drawn += 1;
    home.points += 1;
    away.points += 1;
  }
}

export function computeStats(teamIds: string[], matches: Match[]): Map<string, TeamStats> {
  const table = new Map(teamIds.map((id) => [id, emptyStats(id)]));
  const idSet = new Set(teamIds);

  for (const match of matches) {
    if (!matchPlayed(match)) continue;
    if (match.home.type !== "team" || match.away.type !== "team") continue;
    if (!idSet.has(match.home.teamId) || !idSet.has(match.away.teamId)) continue;
    applyMatch(table, match);
  }

  return table;
}

/**
 * Clare SHC ranking: overall points, then among tied teams only the
 * matches between those teams (points, score difference, scores for).
 */
export function rankTeams(teamIds: string[], matches: Match[]): string[] {
  if (teamIds.length <= 1) return [...teamIds];

  const overall = computeStats(teamIds, matches);
  const byPoints = new Map<number, string[]>();

  for (const id of teamIds) {
    const pts = overall.get(id)?.points ?? 0;
    const bucket = byPoints.get(pts) ?? [];
    bucket.push(id);
    byPoints.set(pts, bucket);
  }

  const ranked: string[] = [];
  const pointTotals = [...byPoints.keys()].sort((a, b) => b - a);

  for (const pts of pointTotals) {
    const tied = byPoints.get(pts) ?? [];
    if (tied.length === 1) {
      ranked.push(tied[0]);
      continue;
    }

    const mini = computeStats(tied, matches);
    const sorted = [...tied].sort((a, b) => {
      const sa = mini.get(a)!;
      const sb = mini.get(b)!;
      if (sb.points !== sa.points) return sb.points - sa.points;
      const diffA = sa.scored - sa.conceded;
      const diffB = sb.scored - sb.conceded;
      if (diffB !== diffA) return diffB - diffA;
      if (sb.scored !== sa.scored) return sb.scored - sa.scored;
      return teamIds.indexOf(a) - teamIds.indexOf(b);
    });
    ranked.push(...sorted);
  }

  return ranked;
}

export function groupStandings(
  teamIds: string[],
  matches: Match[],
  groupComplete: boolean,
): StandingRow[] {
  const ranked = rankTeams(teamIds, matches);
  const stats = computeStats(teamIds, matches);

  return ranked.map((teamId, index) => {
    const row = stats.get(teamId)!;
    const position = index + 1;
    let status: StandingRow["status"] = "pending";
    if (groupComplete) {
      if (position <= 2) status = "quarter-final";
      else if (position === teamIds.length) status = "relegation";
      else status = "safe";
    }
    return {
      ...row,
      position,
      difference: row.scored - row.conceded,
      status,
    };
  });
}

export function groupMatches(matches: Match[], groupId: GroupId): Match[] {
  return matches.filter((match) => match.stage === "group" && match.groupId === groupId);
}

export function groupIsComplete(matches: Match[], groupId: GroupId): boolean {
  const games = groupMatches(matches, groupId);
  return games.length > 0 && games.every(matchPlayed);
}
