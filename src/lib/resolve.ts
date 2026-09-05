import type { Championship, Match, Team, TeamRef } from "../types";
import { matchPlayed, winnerOf } from "./scoring";
import { groupIsComplete, groupStandings } from "./standings";

export function teamById(championship: Championship, id: string): Team | undefined {
  return championship.teams.find((team) => team.id === id);
}

export function resolveTeamId(
  championship: Championship,
  ref: TeamRef,
): string | null {
  if (ref.type === "team") return ref.teamId;

  if (ref.type === "group-position") {
    const group = championship.groups.find((item) => item.id === ref.groupId);
    if (!group) return null;
    const games = championship.matches.filter(
      (match) => match.stage === "group" && match.groupId === ref.groupId,
    );
    if (!groupIsComplete(championship.matches, ref.groupId)) {
      const rows = groupStandings(group.teamIds, games, false);
      return rows[ref.position - 1]?.teamId ?? null;
    }
    const rows = groupStandings(group.teamIds, games, true);
    return rows[ref.position - 1]?.teamId ?? null;
  }

  const source = championship.matches.find((match) => match.id === ref.matchId);
  if (!source) return null;
  const result = winnerOf(source);
  if (result === null || result === "draw") return null;

  const homeId = resolveTeamId(championship, source.home);
  const awayId = resolveTeamId(championship, source.away);
  if (ref.type === "winner") {
    return result === "home" ? homeId : awayId;
  }
  return result === "home" ? awayId : homeId;
}

export function resolveMatchSides(
  championship: Championship,
  match: Match,
): { homeId: string | null; awayId: string | null } {
  return {
    homeId: resolveTeamId(championship, match.home),
    awayId: resolveTeamId(championship, match.away),
  };
}

export function teamRecord(championship: Championship, teamId: string) {
  let played = 0;
  let won = 0;
  let drawn = 0;
  let lost = 0;

  for (const match of championship.matches) {
    if (!matchPlayed(match)) continue;
    const { homeId, awayId } = resolveMatchSides(championship, match);
    if (homeId !== teamId && awayId !== teamId) continue;
    played += 1;
    const result = winnerOf(match);
    if (result === "draw") drawn += 1;
    else if (
      (result === "home" && homeId === teamId) ||
      (result === "away" && awayId === teamId)
    ) {
      won += 1;
    } else {
      lost += 1;
    }
  }

  return { played, won, drawn, lost };
}

export function teamGroup(championship: Championship, teamId: string) {
  return championship.groups.find((group) => group.teamIds.includes(teamId));
}

export function upcomingMatches(championship: Championship, limit = 6): Match[] {
  return championship.matches
    .filter((match) => !matchPlayed(match))
    .slice(0, limit);
}

export function recentResults(championship: Championship, limit = 6): Match[] {
  return [...championship.matches]
    .filter(matchPlayed)
    .reverse()
    .slice(0, limit);
}
